package fr.eloi.notes.secrets

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Mot de passe du NAS (README §16) : chiffré en AES-GCM par une clé générée
 * dans l'Android Keystore, qui ne sort jamais du coffre, et rangé chiffré
 * dans les préférences privées de l'application. Il n'est jamais écrit en
 * clair, jamais journalisé, jamais rendu à la WebView.
 */
class SecretStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(FICHIER, Context.MODE_PRIVATE)

    fun present(): Boolean = preferences.contains(CLE)

    fun enregistrer(motDePasse: CharArray) {
        val octets = versOctets(motDePasse)
        try {
            val chiffreur = Cipher.getInstance(TRANSFORMATION)
            chiffreur.init(Cipher.ENCRYPT_MODE, cle())
            val chiffre = chiffreur.doFinal(octets)
            val tout = chiffreur.iv + chiffre
            preferences.edit().putString(CLE, Base64.encodeToString(tout, Base64.NO_WRAP)).commit()
        } finally {
            octets.fill(0)
        }
    }

    /** Le mot de passe en clair, à effacer par l'appelant (`fill('\u0000')`) dès qu'il a servi. Null s'il n'y en a pas ou s'il est illisible. */
    fun lire(): CharArray? {
        val texte = preferences.getString(CLE, null) ?: return null
        return try {
            val tout = Base64.decode(texte, Base64.NO_WRAP)
            val dechiffreur = Cipher.getInstance(TRANSFORMATION)
            dechiffreur.init(Cipher.DECRYPT_MODE, cle(), GCMParameterSpec(128, tout, 0, TAILLE_IV))
            val octets = dechiffreur.doFinal(tout, TAILLE_IV, tout.size - TAILLE_IV)
            try {
                versCaracteres(octets)
            } finally {
                octets.fill(0)
            }
        } catch (_: Exception) {
            // Clé du coffre perdue (restauration, changement de verrouillage) : le mot de passe sera redemandé.
            null
        }
    }

    fun effacer() {
        preferences.edit().remove(CLE).commit()
        runCatching { KeyStore.getInstance(COFFRE).apply { load(null) }.deleteEntry(ALIAS) }
    }

    private fun cle(): SecretKey {
        val coffre = KeyStore.getInstance(COFFRE).apply { load(null) }
        (coffre.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generateur = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, COFFRE)
        generateur.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generateur.generateKey()
    }

    private fun versOctets(caracteres: CharArray): ByteArray {
        val tampon = Charsets.UTF_8.encode(CharBuffer.wrap(caracteres))
        val octets = ByteArray(tampon.remaining())
        tampon.get(octets)
        tampon.array().fill(0)
        return octets
    }

    private fun versCaracteres(octets: ByteArray): CharArray {
        val tampon = Charsets.UTF_8.decode(ByteBuffer.wrap(octets))
        val caracteres = CharArray(tampon.remaining())
        tampon.get(caracteres)
        tampon.array().fill('\u0000')
        return caracteres
    }

    private companion object {
        const val COFFRE = "AndroidKeyStore"
        const val ALIAS = "notes-mot-de-passe-nas"
        const val FICHIER = "notes-secrets"
        const val CLE = "nas"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAILLE_IV = 12
    }
}
