package smbfs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"

	smb2 "github.com/cloudsoda/go-smb2"

	"notes/smb-companion/internal/protocol"
)

func TestVersErreur(t *testing.T) {
	cas := []struct {
		erreur error
		code   string
	}{
		{os.ErrNotExist, protocol.ErrIntrouvable},
		{fmt.Errorf("stat : %w", os.ErrNotExist), protocol.ErrIntrouvable},
		{os.ErrExist, protocol.ErrExisteDeja},
		{os.ErrPermission, protocol.ErrAccesRefuse},
		{&smb2.ResponseError{Code: statutIdentifiantsFaux}, protocol.ErrIdentifiantsRefuses},
		{&smb2.ResponseError{Code: statutCompteVerrouille}, protocol.ErrIdentifiantsRefuses},
		{&smb2.ResponseError{Code: statutPartageIntrouvable}, protocol.ErrPartageIntrouvable},
		{&smb2.ResponseError{Code: statutDossierNonVide}, protocol.ErrDossierNonVide},
		{&smb2.InternalError{Message: "encryption required but not negotiated with the server"}, protocol.ErrChiffrementAbsent},
		{&smb2.TransportError{Err: errors.New("coupé")}, protocol.ErrInjoignable},
		{context.DeadlineExceeded, protocol.ErrInjoignable},
		{errors.New("autre"), protocol.ErrInterne},
		{invalide("chemin"), protocol.ErrRequeteInvalide},
	}
	for _, c := range cas {
		if obtenu := VersErreur(c.erreur); obtenu.Code != c.code {
			t.Errorf("%v : code %q, attendu %q", c.erreur, obtenu.Code, c.code)
		}
	}
	if VersErreur(nil) != nil {
		t.Error("nil doit rester nil")
	}
}

func TestIdentifiantsVerifiesAvantConnexion(t *testing.T) {
	refuses := []protocol.Credentials{
		{Hote: "", Partage: "p", Utilisateur: "u"},
		{Hote: "nas/x", Partage: "p", Utilisateur: "u"},
		{Hote: "nas", Partage: "", Utilisateur: "u"},
		{Hote: "nas", Partage: `p\q`, Utilisateur: "u"},
		{Hote: "nas", Partage: "p", Utilisateur: ""},
	}
	for _, id := range refuses {
		if _, err := Ouvrir(context.Background(), id); VersErreur(err).Code != protocol.ErrRequeteInvalide {
			t.Errorf("%+v devrait être refusé avant toute connexion, reçu %v", id, err)
		}
	}
}
