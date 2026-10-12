package fr.eloi.notes.smb

import com.hierynomus.msdtyp.AccessMask
import com.hierynomus.mserref.NtStatus
import com.hierynomus.msfscc.FileAttributes
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation
import com.hierynomus.mssmb2.SMB2CreateDisposition
import com.hierynomus.mssmb2.SMB2CreateOptions
import com.hierynomus.mssmb2.SMB2Dialect
import com.hierynomus.mssmb2.SMB2ShareAccess
import com.hierynomus.mssmb2.SMBApiException
import com.hierynomus.protocol.transport.TransportException
import com.hierynomus.smbj.SMBClient
import com.hierynomus.smbj.SmbConfig
import com.hierynomus.smbj.auth.AuthenticationContext
import com.hierynomus.smbj.connection.Connection
import com.hierynomus.smbj.session.Session
import com.hierynomus.smbj.share.DiskShare
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.util.EnumSet
import java.util.concurrent.TimeUnit

/** Erreur à code connu de `RemoteFsErrorCode` (packages/core/src/fs/remote-fs.ts). */
class ErreurSmb(val code: String, message: String) : Exception(message)

/** `hotes` : l'adresse sur le réseau local d'abord, puis, si elle est réglée, l'adresse Tailscale. */
data class ReglagesSmb(val hotes: List<String>, val partage: String, val utilisateur: String)

data class EntreeSmb(val nom: String, val estDossier: Boolean, val taille: Long, val modifieLe: Long)

/** `parTailscale` : la session passe par la deuxième adresse. */
data class EtatSession(val dialecte: String, val signee: Boolean, val chiffree: Boolean, val parTailscale: Boolean)

/**
 * Identité (GUID de serveur SMB, annoncée avant toute authentification) du
 * NAS vu à une adresse locale. Hors de chez soi, la même adresse privée peut
 * désigner une autre machine : on ne lui envoie pas les identifiants.
 */
interface IdentitesConnues {
    fun lire(hote: String): String?
    fun noter(hote: String, identite: String)
}

/** L'adresse répond, mais ce n'est pas le NAS déjà vu là : on passe à l'adresse suivante. */
private class AutreMachine : Exception()

/**
 * Une session SMB vers le NAS, gardée ouverte tant que l'application tourne
 * (README §5) et rouverte d'elle-même après une coupure. Règle 10 du projet :
 * SMB 3.1.1 seul, signature exigée, chiffrement imposé par le client ; si
 * l'un des trois manque, la connexion est refusée, sans repli.
 *
 * N'est pas sûre entre threads : le plugin l'utilise depuis un seul thread.
 */
class SmbSession(private val identites: IdentitesConnues? = null) {
    private var client: SMBClient? = null
    private var connexion: Connection? = null
    private var session: Session? = null
    private var disque: DiskShare? = null
    private var reglages: ReglagesSmb? = null
    var etat: EtatSession? = null
        private set

    /**
     * Ouvre la session. Les adresses sont essayées dans l'ordre : la locale
     * sondée brièvement, puis l'adresse Tailscale. Le mot de passe est effacé
     * par l'appelant après usage. Garde les réglages pour se reconnecter seule.
     * `rouvrir` : le réseau a changé, la session ouverte est peut-être morte.
     */
    fun connecter(nouveaux: ReglagesSmb, motDePasse: CharArray, rouvrir: Boolean = false): EtatSession {
        if (!rouvrir && nouveaux == reglages && disque?.isConnected == true) {
            return etat!!
        }
        fermer()
        reglages = nouveaux
        var injoignable: ErreurSmb? = null
        for ((rang, hote) in nouveaux.hotes.withIndex()) {
            val suivante = rang < nouveaux.hotes.size - 1
            try {
                // Une adresse locale répond en quelques millisecondes : au-delà, on n'est pas chez soi.
                sonder(hote, if (suivante) 1500 else 4000)
                return ouvrir(nouveaux, hote, rang > 0, suivante, motDePasse)
            } catch (erreur: AutreMachine) {
                continue
            } catch (erreur: ErreurSmb) {
                if (erreur.code != "injoignable") throw erreur
                injoignable = erreur
            }
        }
        throw if (nouveaux.hotes.size > 1) ErreurSmb("injoignable", "Le NAS ne répond ni sur le réseau local ni par Tailscale.")
        else injoignable ?: ErreurSmb("injoignable", "Le NAS ne répond pas.")
    }

    private fun ouvrir(nouveaux: ReglagesSmb, hote: String, parTailscale: Boolean, verifierIdentite: Boolean, motDePasse: CharArray): EtatSession {
        val config = SmbConfig.builder()
            .withDialects(SMB2Dialect.SMB_3_1_1)
            .withSigningRequired(true)
            .withEncryptData(true)
            .withTimeout(15, TimeUnit.SECONDS)
            .withSoTimeout(20, TimeUnit.SECONDS)
            .build()
        val nouveauClient = SMBClient(config)
        try {
            val nouvelleConnexion = nouveauClient.connect(hote)
            val dialecte = nouvelleConnexion.negotiatedProtocol.dialect
            if (dialecte != SMB2Dialect.SMB_3_1_1) {
                throw ErreurSmb("chiffrement_absent", "Le NAS n'a pas négocié SMB 3.1.1.")
            }
            val identite = nouvelleConnexion.connectionContext.serverGuid?.toString()
            if (verifierIdentite) {
                val connue = identites?.lire(hote)
                if (connue != null && connue != identite) {
                    throw AutreMachine()
                }
            }
            val nouvelleSession = nouvelleConnexion.authenticate(AuthenticationContext(nouveaux.utilisateur, motDePasse, ""))
            val contexte = nouvelleSession.sessionContext
            if (nouvelleSession.isGuest || nouvelleSession.isAnonymous) {
                throw ErreurSmb("identifiants_refuses", "Le NAS a ouvert une session invité : identifiants refusés.")
            }
            // Chiffrement : la clé de session est négociée et chaque message part chiffré.
            val chiffree = contexte.encryptionKey != null && nouvelleSession.shouldEncryptData()
            // Signature : exigée par la configuration, ou assurée par le chiffrement (AES-GCM authentifie chaque message).
            val signee = contexte.signingKey != null && (contexte.isSigningRequired || chiffree)
            if (!chiffree || !signee) {
                throw ErreurSmb("chiffrement_absent", "Le NAS n'a pas accepté la signature et le chiffrement SMB 3.")
            }
            val partage = nouvelleSession.connectShare(nouveaux.partage) as? DiskShare
                ?: throw ErreurSmb("partage_introuvable", "Ce partage n'est pas un dossier.")
            // Notée même sans adresse Tailscale : elle servira le jour où il y en aura une.
            if (!parTailscale && identite != null) {
                identites?.noter(hote, identite)
            }
            client = nouveauClient
            connexion = nouvelleConnexion
            session = nouvelleSession
            disque = partage
            etat = EtatSession("SMB 3.1.1", signee, chiffree, parTailscale)
            return etat!!
        } catch (erreur: AutreMachine) {
            runCatching { nouveauClient.close() }
            throw erreur
        } catch (erreur: Exception) {
            runCatching { nouveauClient.close() }
            throw traduire(erreur)
        }
    }

    /** Oublie la session et les réglages. */
    fun deconnecter() {
        fermer()
        reglages = null
    }

    /**
     * Exécute une opération sur le partage. Sans session ouverte, ou si elle
     * est tombée (changement de réseau), elle est rouverte avec le mot de
     * passe enregistré, une seule fois.
     */
    fun <T> avecDisque(motDePasse: () -> CharArray?, operation: (DiskShare) -> T): T {
        val actuel = disque
        if (actuel != null && actuel.isConnected) {
            try {
                return operation(actuel)
            } catch (erreur: Exception) {
                val traduite = traduire(erreur)
                if (traduite.code != "injoignable") {
                    throw traduite
                }
                fermer()
            }
        }
        val connus = reglages ?: throw ErreurSmb("non_connecte", "Aucune connexion au NAS.")
        val mot = motDePasse() ?: throw ErreurSmb("identifiants_refuses", "Aucun mot de passe enregistré.")
        try {
            connecter(connus, mot)
        } finally {
            mot.fill('\u0000')
        }
        return try {
            operation(disque!!)
        } catch (erreur: Exception) {
            throw traduire(erreur)
        }
    }

    private fun fermer() {
        runCatching { disque?.close() }
        runCatching { session?.close() }
        runCatching { connexion?.close() }
        runCatching { client?.close() }
        disque = null
        session = null
        connexion = null
        client = null
        etat = null
    }

    /** Le NAS répond-il sur le port SMB ? Évite d'attendre le long délai de smbj quand Tailscale est coupé. */
    private fun sonder(hote: String, delaiMs: Int) {
        try {
            Socket().use { it.connect(InetSocketAddress(hote, 445), delaiMs) }
        } catch (erreur: IOException) {
            throw ErreurSmb("injoignable", "Le NAS ne répond pas.")
        }
    }

    companion object {
        private val aleatoire = SecureRandom()

        /**
         * Cherche l'entrée dans la liste de son dossier plutôt que d'ouvrir le
         * fichier : une ouverture pour lire les attributs a mis 15 s sur Samba,
         * une liste filtrée répond en quelques dizaines de millisecondes.
         */
        fun infos(disque: DiskShare, chemin: String): EntreeSmb? {
            if (chemin.isEmpty()) {
                return EntreeSmb("", true, 0, 0)
            }
            val nom = chemin.substringAfterLast('/')
            return try {
                disque.list(smb(chemin.substringBeforeLast('/', "")), nom).firstOrNull { it.fileName.equals(nom, ignoreCase = true) }?.let(::versEntree)
            } catch (erreur: SMBApiException) {
                if (erreur.status in introuvable) null else throw erreur
            }
        }

        fun lister(disque: DiskShare, chemin: String): List<EntreeSmb> =
            disque.list(smb(chemin)).filter { it.fileName != "." && it.fileName != ".." }.map(::versEntree)

        private val introuvable = setOf(NtStatus.STATUS_OBJECT_NAME_NOT_FOUND, NtStatus.STATUS_OBJECT_PATH_NOT_FOUND, NtStatus.STATUS_NO_SUCH_FILE)

        private fun versEntree(info: FileIdBothDirectoryInformation): EntreeSmb {
            val dossier = info.fileAttributes and FileAttributes.FILE_ATTRIBUTE_DIRECTORY.value != 0L
            return EntreeSmb(info.fileName, dossier, if (dossier) 0 else info.endOfFile, info.lastWriteTime.toEpochMillis())
        }

        fun lire(disque: DiskShare, chemin: String): ByteArray =
            disque.openFile(smb(chemin), EnumSet.of(AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null).use { fichier ->
                fichier.inputStream.use { it.readBytes() }
            }

        /** Écrit dans un fichier temporaire du même dossier, puis le renomme : l'autre appareil ne lit jamais un fichier à moitié écrit (README §5). */
        fun ecrire(disque: DiskShare, chemin: String, contenu: ByteArray) {
            val dossier = chemin.substringBeforeLast('/', "")
            val nom = chemin.substringAfterLast('/')
            val temporaire = (if (dossier.isEmpty()) "" else "$dossier/") + ".$nom.${aleatoire.nextInt(Int.MAX_VALUE).toString(16)}.tmp"
            disque.openFile(
                smb(temporaire),
                EnumSet.of(AccessMask.GENERIC_WRITE, AccessMask.DELETE),
                null,
                SMB2ShareAccess.ALL,
                SMB2CreateDisposition.FILE_CREATE,
                EnumSet.of(SMB2CreateOptions.FILE_NON_DIRECTORY_FILE),
            ).use { fichier ->
                try {
                    fichier.outputStream.use { it.write(contenu) }
                    fichier.rename(smb(chemin), true)
                } catch (erreur: Exception) {
                    runCatching { fichier.deleteOnClose() }
                    throw erreur
                }
            }
        }

        fun creerDossier(disque: DiskShare, chemin: String) {
            var courant = ""
            for (morceau in chemin.split('/').filter { it.isNotEmpty() }) {
                courant = if (courant.isEmpty()) morceau else "$courant/$morceau"
                if (!disque.folderExists(smb(courant))) {
                    disque.mkdir(smb(courant))
                }
            }
        }

        fun renommer(disque: DiskShare, chemin: String, vers: String) {
            disque.open(smb(chemin), EnumSet.of(AccessMask.DELETE, AccessMask.GENERIC_READ), null, SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null).use {
                it.rename(smb(vers), true)
            }
        }

        fun supprimer(disque: DiskShare, chemin: String) {
            if (disque.folderExists(smb(chemin))) disque.rmdir(smb(chemin), false) else disque.rm(smb(chemin))
        }

        private fun smb(chemin: String): String = chemin.replace('/', '\\')

        /** Une erreur de smbj ou du réseau devient un code connu, sans rien de sensible dans le message. */
        fun traduire(erreur: Throwable): ErreurSmb {
            if (erreur is ErreurSmb) return erreur
            if (erreur is SMBApiException) {
                return when (erreur.status) {
                    NtStatus.STATUS_LOGON_FAILURE, NtStatus.STATUS_PASSWORD_EXPIRED, NtStatus.STATUS_ACCOUNT_DISABLED ->
                        ErreurSmb("identifiants_refuses", "Identifiants refusés par le NAS.")
                    NtStatus.STATUS_BAD_NETWORK_NAME -> ErreurSmb("partage_introuvable", "Partage introuvable.")
                    NtStatus.STATUS_OBJECT_NAME_NOT_FOUND, NtStatus.STATUS_OBJECT_PATH_NOT_FOUND, NtStatus.STATUS_NO_SUCH_FILE -> ErreurSmb("introuvable", "Fichier introuvable.")
                    NtStatus.STATUS_OBJECT_NAME_COLLISION -> ErreurSmb("existe_deja", "Existe déjà.")
                    NtStatus.STATUS_DIRECTORY_NOT_EMPTY -> ErreurSmb("dossier_non_vide", "Dossier non vide.")
                    NtStatus.STATUS_ACCESS_DENIED -> ErreurSmb("acces_refuse", "Accès refusé.")
                    else -> ErreurSmb("interne", "Erreur SMB ${erreur.status.name}.")
                }
            }
            var cause: Throwable? = erreur
            while (cause != null) {
                if (cause is IOException || cause is TransportException) {
                    return ErreurSmb("injoignable", "Le NAS ne répond pas.")
                }
                if (cause is SMBApiException) return traduire(cause)
                cause = cause.cause
            }
            return ErreurSmb("interne", erreur.javaClass.simpleName)
        }
    }
}
