package fr.eloi.notes.secrets

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Ce que la WebView peut savoir du mot de passe : s'il est enregistré. Elle peut l'effacer, jamais le lire. */
@CapacitorPlugin(name = "Secrets")
class SecretsPlugin : Plugin() {
    private val coffre by lazy { SecretStore(context) }

    @PluginMethod
    fun presence(call: PluginCall) {
        call.resolve(JSObject().put("present", coffre.present()))
    }

    @PluginMethod
    fun effacer(call: PluginCall) {
        coffre.effacer()
        call.resolve()
    }
}
