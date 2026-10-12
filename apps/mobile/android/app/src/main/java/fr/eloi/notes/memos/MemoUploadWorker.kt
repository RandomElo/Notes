package fr.eloi.notes.memos

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import fr.eloi.notes.secrets.SecretStore
import fr.eloi.notes.smb.IdentitesDuNas
import fr.eloi.notes.smb.ReglagesSmb
import fr.eloi.notes.smb.SmbSession
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Envoi des mémos en attente, application fermée (choix d'Eloi, 2026-10-11) :
 * lancé à la fin de chaque enregistrement, il attend qu'il y ait du réseau,
 * et réessaie plus tard si le NAS ne répond pas. Mêmes règles que
 * `envoyerMemosEnAttente` de core, que l'application suit quand elle est
 * ouverte : un mémo dont le nom est déjà sur le NAS n'est ni renvoyé ni
 * écrasé, et n'est retiré du téléphone qu'une fois écrit. Les réglages du NAS
 * sont ceux que l'application a enregistrés (`reglages.json`), le mot de
 * passe celui du Keystore.
 */
class MemoUploadWorker(context: Context, parametres: WorkerParameters) : CoroutineWorker(context, parametres) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val memos = File(applicationContext.filesDir, Recording.DOSSIER_EN_ATTENTE)
            .listFiles { fichier -> fichier.isFile && fichier.length() > 0 && nomValide.matches(fichier.name) }
            ?.sortedBy { it.name }
            .orEmpty()
        if (memos.isEmpty()) return@withContext Result.success()
        val reglages = lireReglages(applicationContext) ?: return@withContext Result.success()
        val mot = SecretStore(applicationContext).lire() ?: return@withContext Result.success()
        val smb = SmbSession(IdentitesDuNas(applicationContext))
        try {
            try {
                smb.connecter(reglages.smb, mot)
            } finally {
                mot.fill('\u0000')
            }
            smb.avecDisque({ null }) { disque ->
                val dossier = listOf(reglages.dossierVault, ".notes/memos").filter { it.isNotEmpty() }.joinToString("/")
                SmbSession.creerDossier(disque, dossier)
                for (memo in memos) {
                    val chemin = "$dossier/${memo.name}"
                    if (SmbSession.infos(disque, chemin) == null) {
                        SmbSession.ecrire(disque, chemin, memo.readBytes())
                    }
                    memo.delete()
                }
            }
            Result.success()
        } catch (erreur: Throwable) {
            // Identifiants ou partage refusés : inutile d'insister, l'application le dira à la prochaine ouverture.
            val code = SmbSession.traduire(erreur).code
            if (code == "injoignable" || code == "interne") Result.retry() else Result.failure()
        } finally {
            smb.deconnecter()
        }
    }

    private class Reglages(val smb: ReglagesSmb, val dossierVault: String)

    companion object {
        private const val TRAVAIL = "envoi-memos"
        private val nomValide = Regex("^memo-\\d{4}-\\d{2}-\\d{2}-\\d{6}\\.m4a$")

        /** Demande un envoi dès qu'il y a du réseau. Un envoi en cours est suivi d'un autre, pour ne pas manquer le dernier mémo. */
        fun planifier(context: Context) {
            val travail = OneTimeWorkRequestBuilder<MemoUploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(TRAVAIL, ExistingWorkPolicy.APPEND_OR_REPLACE, travail)
        }

        /** Les réglages écrits par l'application (`apps/mobile/src/state/phone-settings.ts`), null s'ils manquent ou sont douteux. */
        private fun lireReglages(context: Context): Reglages? = try {
            val json = JSONObject(File(context.filesDir, "reglages.json").readText())
            val nas = json.getJSONObject("nas")
            val hotes = listOf(nas.getString("hote"), json.optString("hoteTailscale").trim()).filter { it.isNotBlank() }.distinct()
            val dossierVault = nas.optString("dossierVault").trim('/')
            val cheminSur = dossierVault.isEmpty() || dossierVault.split('/').none { it.isEmpty() || it == "." || it == ".." || it.any { c -> c < ' ' || c in "\\:*?\"<>|" } }
            if (hotes.isEmpty() || !cheminSur) null else Reglages(ReglagesSmb(hotes, nas.getString("partage"), nas.getString("utilisateur")), dossierVault)
        } catch (_: Exception) {
            null
        }
    }
}
