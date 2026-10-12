package fr.eloi.notes.smb

import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.hierynomus.smbj.share.DiskShare
import fr.eloi.notes.secrets.SecretStore
import java.util.concurrent.Executors

/**
 * `RemoteFs` du téléphone (apps/mobile/src/platform/smb-remote-fs.ts). Les
 * appels smbj sont bloquants : ils passent tous par un thread à part, un à la
 * fois, jamais par celui de l'interface ni par celui des autres plugins.
 */
@CapacitorPlugin(name = "Smb")
class SmbPlugin : Plugin() {
    private val fil = Executors.newSingleThreadExecutor { Thread(it, "notes-smb").apply { isDaemon = true } }
    private val smb by lazy { SmbSession(IdentitesDuNas(context)) }
    private val coffre by lazy { SecretStore(context) }

    @PluginMethod
    fun connecter(call: PluginCall) = executer(call) {
        val hotes = listOfNotNull(texte(call, "hote"), call.getString("hoteTailscale")?.trim()?.takeIf { it.isNotEmpty() }).distinct()
        val reglages = ReglagesSmb(hotes, texte(call, "partage"), texte(call, "utilisateur"))
        val saisi = call.getString("motDePasse")?.toCharArray()
        val mot = saisi ?: coffre.lire() ?: throw ErreurSmb("identifiants_refuses", "Aucun mot de passe enregistré.")
        val etat = try {
            smb.connecter(reglages, mot, rouvrir = call.getBoolean("rouvrir", false) == true).also {
                // Un mot de passe saisi n'est gardé qu'une fois la connexion réussie.
                if (saisi != null) coffre.enregistrer(saisi)
            }
        } finally {
            mot.fill('\u0000')
        }
        JSObject().put("dialecte", etat.dialecte).put("signee", etat.signee).put("chiffree", etat.chiffree).put("parTailscale", etat.parTailscale)
    }

    @PluginMethod
    fun deconnecter(call: PluginCall) = executer(call) {
        smb.deconnecter()
        null
    }

    @PluginMethod
    fun infos(call: PluginCall) = surDisque(call) { disque, chemin ->
        JSObject().put("entree", SmbSession.infos(disque, chemin)?.let(::versJs) ?: org.json.JSONObject.NULL)
    }

    @PluginMethod
    fun lister(call: PluginCall) = surDisque(call) { disque, chemin ->
        JSObject().put("entrees", JSArray(SmbSession.lister(disque, chemin).map(::versJs)))
    }

    @PluginMethod
    fun lire(call: PluginCall) = surDisque(call) { disque, chemin ->
        JSObject().put("donnees", Base64.encodeToString(SmbSession.lire(disque, chemin), Base64.NO_WRAP))
    }

    @PluginMethod
    fun ecrire(call: PluginCall) = surDisque(call) { disque, chemin ->
        SmbSession.ecrire(disque, chemin, Base64.decode(texte(call, "donnees", vide = true), Base64.NO_WRAP))
        null
    }

    @PluginMethod
    fun creerDossier(call: PluginCall) = surDisque(call) { disque, chemin ->
        SmbSession.creerDossier(disque, chemin)
        null
    }

    @PluginMethod
    fun renommer(call: PluginCall) = surDisque(call) { disque, chemin ->
        SmbSession.renommer(disque, chemin, cheminValide(texte(call, "vers")))
        null
    }

    @PluginMethod
    fun supprimer(call: PluginCall) = surDisque(call) { disque, chemin ->
        SmbSession.supprimer(disque, chemin)
        null
    }

    override fun handleOnDestroy() {
        fil.execute { smb.deconnecter() }
        fil.shutdown()
    }

    private fun surDisque(call: PluginCall, operation: (DiskShare, String) -> JSObject?) = executer(call) {
        val chemin = cheminValide(call.getString("chemin") ?: "", racinePermise = true)
        smb.avecDisque({ coffre.lire() }) { disque -> operation(disque, chemin) }
    }

    private fun executer(call: PluginCall, travail: () -> JSObject?) {
        fil.execute {
            try {
                val resultat = travail()
                if (resultat == null) call.resolve() else call.resolve(resultat)
            } catch (erreur: Throwable) {
                val traduite = SmbSession.traduire(erreur)
                call.reject(traduite.message, traduite.code)
            }
        }
    }

    private fun texte(call: PluginCall, nom: String, vide: Boolean = false): String {
        val valeur = call.getString(nom) ?: throw ErreurSmb("requete_invalide", "Paramètre manquant : $nom.")
        if (!vide && valeur.isBlank()) throw ErreurSmb("requete_invalide", "Paramètre vide : $nom.")
        return valeur
    }

    /** Mêmes règles que `verifierCheminRelatif` de core : relatif, sans « .. », sans caractère refusé par SMB. */
    private fun cheminValide(chemin: String, racinePermise: Boolean = false): String {
        if (chemin.isEmpty() && racinePermise) return chemin
        val morceaux = chemin.split('/')
        val refuse = chemin.isEmpty() || chemin.length > 4096 || chemin.startsWith('/') ||
            morceaux.any { it.isEmpty() || it == "." || it == ".." || it.any { c -> c < ' ' || c in "\\:*?\"<>|" } }
        if (refuse) throw ErreurSmb("requete_invalide", "Chemin refusé.")
        return chemin
    }

    private fun versJs(entree: EntreeSmb): JSObject =
        JSObject().put("nom", entree.nom).put("estDossier", entree.estDossier).put("taille", entree.taille).put("modifieLe", entree.modifieLe)
}
