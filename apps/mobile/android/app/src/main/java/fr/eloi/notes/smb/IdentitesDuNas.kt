package fr.eloi.notes.smb

import android.content.Context

/**
 * Identités du NAS par adresse locale, dans les préférences privées de
 * l'application. Ce n'est pas un secret : le GUID du serveur est annoncé à
 * quiconque se connecte, il sert seulement à reconnaître le NAS.
 */
class IdentitesDuNas(context: Context) : IdentitesConnues {
    private val preferences = context.applicationContext.getSharedPreferences("notes-nas", Context.MODE_PRIVATE)

    override fun lire(hote: String): String? = preferences.getString(cle(hote), null)

    override fun noter(hote: String, identite: String) {
        if (lire(hote) != identite) {
            preferences.edit().putString(cle(hote), identite).apply()
        }
    }

    private fun cle(hote: String) = "identite:" + hote.lowercase()
}
