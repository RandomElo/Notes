package smbfs

import (
	"errors"
	"os"

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

// Ecrire remplace le contenu d'un fichier, ou le crée.
func (s *Session) Ecrire(chemin string, contenu []byte) error {
	cheminSmb, err := versCheminSmb(chemin, false)
	if err != nil {
		return err
	}
	return s.executer(true, func(partage *smb2.Share) error {
		return partage.WriteFile(cheminSmb, contenu, 0o644)
	})
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
