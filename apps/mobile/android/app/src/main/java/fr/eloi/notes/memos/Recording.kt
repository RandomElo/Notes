package fr.eloi.notes.memos

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/**
 * L'enregistrement d'un mémo vocal (docs/spec/memos.md) : AAC dans un `.m4a`, mono,
 * 16 kHz, assez pour la voix. Un seul à la fois, partagé entre le plugin (la
 * WebView) et le service de premier plan (la notification). Le fichier est
 * écrit dans `memos-en-cours/`, puis rangé dans `memos/` une fois terminé :
 * c'est là que l'application le prend pour l'envoyer sur le NAS. Un
 * enregistrement coupé net (application tuée) n'est jamais un `.m4a` lisible :
 * il est jeté au suivant.
 */
object Recording {
    /** Dossier des mémos terminés, pas encore envoyés (`Directory.Data` de Capacitor, `memos`). */
    const val DOSSIER_EN_ATTENTE = "memos"
    private const val DOSSIER_EN_COURS = "memos-en-cours"
    private val nomValide = Regex("^memo-\\d{4}-\\d{2}-\\d{2}-\\d{6}\\.m4a$")

    private var enregistreur: MediaRecorder? = null
    private var fichier: File? = null
    private var debut = 0L

    /** Message du dernier enregistrement qui n'a pas pu être gardé, rendu une fois. */
    private var erreur: String? = null

    data class Etat(val enCours: Boolean, val nom: String?, val depuis: Long, val niveau: Double, val erreur: String?)

    @Synchronized
    fun demarrer(context: Context, nom: String) {
        if (!nomValide.matches(nom)) throw ErreurEnregistrement("requete_invalide", "Nom de mémo invalide.")
        if (enregistreur != null) throw ErreurEnregistrement("deja_en_cours", "Un mémo est déjà en cours d'enregistrement.")
        val dossier = File(context.filesDir, DOSSIER_EN_COURS)
        dossier.listFiles()?.forEach { it.delete() }
        dossier.mkdirs()
        val cible = File(dossier, nom)
        val nouveau = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            nouveau.setAudioSource(MediaRecorder.AudioSource.MIC)
            nouveau.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            nouveau.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            nouveau.setAudioChannels(1)
            nouveau.setAudioSamplingRate(16_000)
            nouveau.setAudioEncodingBitRate(32_000)
            nouveau.setOutputFile(cible.absolutePath)
            nouveau.prepare()
            nouveau.start()
        } catch (probleme: Exception) {
            nouveau.release()
            cible.delete()
            throw ErreurEnregistrement("micro_indisponible", "Le micro n'est pas disponible (appel en cours ?).")
        }
        enregistreur = nouveau
        fichier = cible
        debut = System.currentTimeMillis()
        erreur = null
    }

    /**
     * Arrête et range le mémo pour l'envoi. Rend son nom, null s'il n'y avait
     * rien ou qu'il n'a pas pu être gardé. `signaler` (terminé depuis la
     * notification) : l'échec est gardé pour que l'application le montre.
     */
    @Synchronized
    fun terminer(context: Context, signaler: Boolean = false): String? {
        val courant = enregistreur ?: return null
        val cible = fichier ?: return null
        enregistreur = null
        fichier = null
        val garde = try {
            courant.stop()
            true
        } catch (probleme: RuntimeException) {
            // Arrêté avant d'avoir reçu du son : le fichier n'est pas lisible.
            false
        } finally {
            courant.release()
        }
        if (!garde || cible.length() == 0L) {
            cible.delete()
            if (signaler) erreur = "Mémo trop court : rien n'a été gardé."
            return null
        }
        val dossier = File(context.filesDir, DOSSIER_EN_ATTENTE)
        dossier.mkdirs()
        if (!cible.renameTo(File(dossier, cible.name))) {
            cible.delete()
            if (signaler) erreur = "Le mémo n'a pas pu être rangé sur le téléphone."
            return null
        }
        // Il part sur le NAS même si l'application est fermée, dès que le réseau le permet.
        MemoUploadWorker.planifier(context)
        return cible.name
    }

    @Synchronized
    fun annuler() {
        val courant = enregistreur ?: return
        enregistreur = null
        try {
            courant.stop()
        } catch (_: RuntimeException) {
        } finally {
            courant.release()
        }
        fichier?.delete()
        fichier = null
    }

    @Synchronized
    fun etat(): Etat {
        val courant = enregistreur
        // Le plus fort niveau depuis la dernière question, ramené entre 0 et 1.
        val niveau = if (courant == null) 0.0 else (courant.maxAmplitude / 32_767.0).coerceIn(0.0, 1.0)
        val rendue = erreur
        erreur = null
        return Etat(courant != null, fichier?.name, if (courant == null) 0L else debut, niveau, rendue)
    }

    @Synchronized
    fun enCours(): Boolean = enregistreur != null
}

class ErreurEnregistrement(val code: String, message: String) : Exception(message)
