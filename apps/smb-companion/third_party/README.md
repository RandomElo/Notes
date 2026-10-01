# third_party

`go-smb2/` est une copie de `github.com/cloudsoda/go-smb2` (version `v0.0.0-20260918041005-0c5d69b69701`) avec le correctif `../patches/go-smb2-encryption.patch` appliqué. Elle est branchée par la directive `replace` du `go.mod`.

Le correctif ajoute `ForceEncryption` : le client demande le chiffrement lui-même et refuse la session s'il n'est pas négocié. La lib d'origine ne chiffre que si le serveur l'exige.

Mettre à jour la lib :

1. Remplacer le contenu de `go-smb2/` par la nouvelle version (sans son dossier `.github`).
2. Depuis `third_party/`, lancer `patch -p1 < ../patches/go-smb2-encryption.patch`.
3. Relancer le test d'intégration (`go test -tags nas ./internal/smbfs/`) : il échoue si une seule réponse n'est pas chiffrée.
