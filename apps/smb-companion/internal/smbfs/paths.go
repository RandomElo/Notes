package smbfs

import (
	"strings"

	"notes/smb-companion/internal/protocol"
)

// versCheminSmb convertit un chemin du protocole (relatif au partage, séparé
// par "/") en chemin SMB. Il refuse tout ce qui permettrait de sortir du
// partage ou de viser autre chose qu'un fichier ordinaire.
func versCheminSmb(chemin string, racinePermise bool) (string, error) {
	if chemin == "" {
		if racinePermise {
			return "", nil
		}
		return "", invalide("chemin vide")
	}
	if strings.ContainsAny(chemin, "\\\x00:*?\"<>|") {
		return "", invalide("caractère interdit dans le chemin")
	}
	if strings.HasPrefix(chemin, "/") || strings.HasSuffix(chemin, "/") {
		return "", invalide("le chemin ne commence ni ne finit par /")
	}
	morceaux := strings.Split(chemin, "/")
	for _, morceau := range morceaux {
		if morceau == "" || morceau == "." || morceau == ".." {
			return "", invalide("segment de chemin interdit")
		}
		if strings.TrimRight(morceau, " .") != morceau {
			return "", invalide("un segment ne finit ni par un point ni par une espace")
		}
	}
	return strings.Join(morceaux, `\`), nil
}

func invalide(message string) error {
	return &protocol.ErrorBody{Code: protocol.ErrRequeteInvalide, Message: message}
}
