package fr.eloi.notes.memos

import android.Manifest
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Enregistrement des mémos vocaux depuis la WebView (apps/mobile/src/platform/recorder.ts).
 * Le micro est demandé au premier mémo ; les notifications aussi (Android 13
 * et plus), sans elles l'enregistrement marche mais sa notification ne se
 * voit pas.
 */
@CapacitorPlugin(
    name = "Recorder",
    permissions = [
        Permission(alias = "micro", strings = [Manifest.permission.RECORD_AUDIO]),
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class RecorderPlugin : Plugin() {
    @PluginMethod
    fun demarrer(call: PluginCall) {
        if (getPermissionState("micro") != PermissionState.GRANTED) {
            val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) arrayOf("micro", "notifications") else arrayOf("micro")
            requestPermissionForAliases(alias, call, "apresPermission")
            return
        }
        lancer(call)
    }

    @PermissionCallback
    private fun apresPermission(call: PluginCall) {
        if (getPermissionState("micro") == PermissionState.GRANTED) {
            lancer(call)
        } else {
            call.reject("Notes n'a pas accès au micro. Autorise-le dans les réglages d'Android, rubrique Applications, Notes, Autorisations.", "micro_refuse")
        }
    }

    private fun lancer(call: PluginCall) {
        try {
            Recording.demarrer(context, call.getString("nom") ?: "")
            RecordingService.lancer(context)
            call.resolve()
        } catch (erreur: ErreurEnregistrement) {
            call.reject(erreur.message, erreur.code)
        }
    }

    @PluginMethod
    fun terminer(call: PluginCall) {
        val nom = Recording.terminer(context)
        RecordingService.arreter(context)
        call.resolve(JSObject().put("nom", nom ?: org.json.JSONObject.NULL))
    }

    @PluginMethod
    fun annuler(call: PluginCall) {
        Recording.annuler()
        RecordingService.arreter(context)
        call.resolve()
    }

    @PluginMethod
    fun etat(call: PluginCall) {
        val etat = Recording.etat()
        call.resolve(
            JSObject()
                .put("enCours", etat.enCours)
                .put("depuis", etat.depuis)
                .put("niveau", etat.niveau)
                .put("erreur", etat.erreur ?: org.json.JSONObject.NULL),
        )
    }
}
