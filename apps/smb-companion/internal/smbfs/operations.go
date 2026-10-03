package smbfs

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"strings"

	smb2 "github.com/cloudsoda/go-smb2"

	"notes/smb-companion/internal/protocol"
)

// Infos renvoie les métadonnées d'un chemin, ou nil s'il n'existe pas.
func (s *Session) Infos(chemin string) (*protocol.Entry, error) {
	cheminSmb, err := versCheminSmb(chemin, true)
	if err != nil {
		return nil, err
	}
	var entree *protocol.Entry
	err = s.executer(true, func(partage *smb2.Share) error {
		infos, err := partage.Stat(cheminSmb)
		if errors.Is(err, os.ErrNotExist) {
			entree = nil
			return nil
		}
		if err != nil {
			return err
		}
		e := versEntree(infos)
		entree = &e
		return nil
	})
	return entree, err
}

// Lister renvoie le contenu d'un dossier. Le chemin vide désigne la racine du partage.
func (s *Session) Lister(chemin string) ([]protocol.Entry, error) {
	cheminSmb, err := versCheminSmb(chemin, true)
	if err != nil {
		return nil, err
	}
	entrees := []protocol.Entry{}
	err = s.executer(true, func(partage *smb2.Share) error {
		infos, err := partage.ReadDir(cheminSmb)
		if err != nil {
			return err
		}
		entrees = entrees[:0]
		for _, info := range infos {
			if info.Name() == "." || info.Name() == ".." {
				continue
			}
			entrees = append(entrees, versEntree(info))
		}
		return nil
	})
	return entrees, err
}

// Lire renvoie le contenu complet d'un fichier.
func (s *Session) Lire(chemin string) ([]byte, error) {
	cheminSmb, err := versCheminSmb(chemin, false)
	if err != nil {
		return nil, err
	}
	var contenu []byte
	err = s.executer(true, func(partage *smb2.Share) error {
		lu, err := partage.ReadFile(cheminSmb)
		contenu = lu
		return err
	})
	return contenu, err
}

// Ecrire remplace le contenu d'un fichier, ou le crée. L'écriture est
// atomique : le contenu va dans un fichier temporaire du même dossier, qui
// remplace ensuite la cible d'un seul renommage. Un lecteur (l'autre appareil)
// voit l'ancienne version ou la nouvelle, jamais un fichier à moitié écrit.
func (s *Session) Ecrire(chemin string, contenu []byte) error {
	cheminSmb, err := versCheminSmb(chemin, false)
	if err != nil {
		return err
	}
	return s.executer(true, func(partage *smb2.Share) error {
		// Un nom neuf à chaque essai : un essai rejoué après une coupure ne retombe pas sur l'ancien temporaire.
		temporaire, err := nomTemporaire(cheminSmb)
		if err != nil {
			return err
		}
		if err := partage.WriteFile(temporaire, contenu, 0o644); err != nil {
			_ = partage.Remove(temporaire)
			return err
		}
		if err := partage.Rename(temporaire, cheminSmb); err != nil {
			_ = partage.Remove(temporaire)
			return err
		}
		return nil
	})
}

// nomTemporaire donne « .nom.xxxxxxxxxxxx.tmp » à côté du fichier visé : la
// sync ignore ce motif (packages/core/src/sync/scan.ts).
func nomTemporaire(cheminSmb string) (string, error) {
	alea := make([]byte, 6)
	if _, err := rand.Read(alea); err != nil {
		return "", err
	}
	dossier, nom := "", cheminSmb
	if coupure := strings.LastIndex(cheminSmb, `\`); coupure >= 0 {
		dossier, nom = cheminSmb[:coupure+1], cheminSmb[coupure+1:]
	}
	return dossier + "." + nom + "." + hex.EncodeToString(alea) + ".tmp", nil
}

// CreerDossier crée un dossier et ses parents manquants. Sans effet s'il existe.
func (s *Session) CreerDossier(chemin string) error {
	cheminSmb, err := versCheminSmb(chemin, false)
	if err != nil {
		return err
	}
	return s.executer(true, func(partage *smb2.Share) error {
		return partage.MkdirAll(cheminSmb, 0o755)
	})
}

// Renommer déplace un fichier ou un dossier. Jamais rejoué après une coupure :
// on ne sait pas si le NAS l'a déjà fait.
func (s *Session) Renommer(chemin, vers string) error {
	ancien, err := versCheminSmb(chemin, false)
	if err != nil {
		return err
	}
	nouveau, err := versCheminSmb(vers, false)
	if err != nil {
		return err
	}
	return s.executer(false, func(partage *smb2.Share) error {
		return partage.Rename(ancien, nouveau)
	})
}

// Supprimer retire un fichier ou un dossier vide.
func (s *Session) Supprimer(chemin string) error {
	cheminSmb, err := versCheminSmb(chemin, false)
	if err != nil {
		return err
	}
	return s.executer(false, func(partage *smb2.Share) error {
		return partage.Remove(cheminSmb)
	})
}

func versEntree(infos os.FileInfo) protocol.Entry {
	return protocol.Entry{
		Nom:        infos.Name(),
		EstDossier: infos.IsDir(),
		Taille:     infos.Size(),
		ModifieLe:  infos.ModTime().UnixMilli(),
	}
}
