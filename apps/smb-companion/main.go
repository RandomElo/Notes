// smb-companion est le client SMB du desktop. Le main d'Electron le lance,
// lui envoie des requêtes JSON sur l'entrée standard (une par ligne) et lit
// les réponses sur la sortie standard. Le mot de passe arrive dans la requête
// « connecter », jamais en argument ni en variable d'environnement.
package main

import (
	"context"
	"fmt"
	"os"

	"notes/smb-companion/internal/protocol"
	"notes/smb-companion/internal/server"
	"notes/smb-companion/internal/smbfs"
)

// version est renseignée à la compilation par scripts/build-companion.sh.
var version = "dev"

func main() {
	if len(os.Args) > 1 {
		if os.Args[1] == "--version" {
			fmt.Println(version)
			return
		}
		fmt.Fprintln(os.Stderr, "smb-companion ne prend aucun argument : il se pilote par son entrée standard")
		os.Exit(2)
	}

	connecter := func(ctx context.Context, identifiants protocol.Credentials) (server.Backend, error) {
		return smbfs.Ouvrir(ctx, identifiants)
	}
	if err := server.Nouveau(connecter, smbfs.VersErreur).Servir(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "arrêt du compagnon :", err)
		os.Exit(1)
	}
}
