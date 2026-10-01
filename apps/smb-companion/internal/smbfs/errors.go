package smbfs

import (
	"context"
	"errors"
	"io"
	"net"
	"os"
	"strings"

	smb2 "github.com/cloudsoda/go-smb2"

	"notes/smb-companion/internal/protocol"
)

// Codes NTSTATUS utiles, voir [MS-ERREF].
const (
	statutAccesRefuse        = 0xC0000022
	statutIdentifiantsFaux   = 0xC000006D
	statutRestrictionCompte  = 0xC000006E
	statutPartageIntrouvable = 0xC00000CC
	statutDossierNonVide     = 0xC0000101
	statutCompteVerrouille   = 0xC0000234
)

// VersErreur traduit une erreur de la lib SMB en erreur du protocole.
// Le message ne contient jamais d'identifiant.
func VersErreur(err error) *protocol.ErrorBody {
	if err == nil {
		return nil
	}
	var dejaTraduite *protocol.ErrorBody
	if errors.As(err, &dejaTraduite) {
		return dejaTraduite
	}

	switch {
	case errors.Is(err, os.ErrNotExist):
		return erreur(protocol.ErrIntrouvable, "fichier ou dossier introuvable")
	case errors.Is(err, os.ErrExist):
		return erreur(protocol.ErrExisteDeja, "le fichier ou le dossier existe déjà")
	case errors.Is(err, os.ErrPermission):
		return erreur(protocol.ErrAccesRefuse, "accès refusé par le NAS")
	}

	var reponse *smb2.ResponseError
	if errors.As(err, &reponse) {
		switch reponse.Code {
		case statutIdentifiantsFaux, statutRestrictionCompte, statutCompteVerrouille:
			return erreur(protocol.ErrIdentifiantsRefuses, "identifiants refusés par le NAS")
		case statutPartageIntrouvable:
			return erreur(protocol.ErrPartageIntrouvable, "partage introuvable sur le NAS")
		case statutDossierNonVide:
			return erreur(protocol.ErrDossierNonVide, "le dossier n'est pas vide")
		case statutAccesRefuse:
			return erreur(protocol.ErrAccesRefuse, "accès refusé par le NAS")
		}
		return erreur(protocol.ErrInterne, reponse.Error())
	}

	var interne *smb2.InternalError
	if errors.As(err, &interne) && strings.Contains(interne.Message, "encryption required") {
		return erreur(protocol.ErrChiffrementAbsent, "le NAS n'a pas négocié le chiffrement SMB 3")
	}

	if estCoupure(err) {
		return erreur(protocol.ErrInjoignable, "NAS injoignable")
	}
	return erreur(protocol.ErrInterne, err.Error())
}

// estCoupure dit si l'erreur vient du réseau plutôt que d'un refus du NAS.
func estCoupure(err error) bool {
	var transport *smb2.TransportError
	var reseau net.Error
	return errors.As(err, &transport) ||
		errors.As(err, &reseau) ||
		errors.Is(err, io.EOF) ||
		errors.Is(err, io.ErrUnexpectedEOF) ||
		errors.Is(err, net.ErrClosed) ||
		errors.Is(err, context.DeadlineExceeded)
}

func erreur(code, message string) *protocol.ErrorBody {
	return &protocol.ErrorBody{Code: code, Message: message}
}
