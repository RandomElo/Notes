// Package smbfs parle SMB au NAS. Toute session impose SMB 3.1.1, la
// signature et le chiffrement, et échoue si l'un des trois manque.
package smbfs

import (
	"context"
	"net"
	"strings"
	"time"

	smb2 "github.com/cloudsoda/go-smb2"

	"notes/smb-companion/internal/protocol"
)

const (
	dialecteSmb311   = 0x311
	portSmb          = "445"
	delaiConnexion   = 15 * time.Second
	delaiOperation   = 30 * time.Second
	nomDialecteExige = "SMB 3.1.1"
)

// Session garde la connexion au NAS ouverte entre deux opérations et la
// rouvre si elle tombe.
type Session struct {
	identifiants protocol.Credentials
	session      *smb2.Session
	partage      *smb2.Share
}

// Ouvrir se connecte, s'authentifie et ouvre le partage.
func Ouvrir(ctx context.Context, identifiants protocol.Credentials) (*Session, error) {
	if err := verifierIdentifiants(identifiants); err != nil {
		return nil, err
	}
	s := &Session{identifiants: identifiants}
	if err := s.connecter(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

func verifierIdentifiants(id protocol.Credentials) error {
	if id.Hote == "" || strings.ContainsAny(id.Hote, " /\\") {
		return invalide("adresse du NAS invalide")
	}
	if id.Partage == "" || strings.ContainsAny(id.Partage, "/\\") {
		return invalide("nom de partage invalide")
	}
	if id.Utilisateur == "" {
		return invalide("utilisateur manquant")
	}
	return nil
}

func (s *Session) connecter(ctx context.Context) error {
	// Le chiffrement est demandé par le client : sans lui la session est refusée.
	smb2.ForceEncryption = true

	ctx, annuler := context.WithTimeout(ctx, delaiConnexion)
	defer annuler()

	numeroteur := &smb2.Dialer{
		Negotiator: smb2.Negotiator{
			RequireMessageSigning: true,
			SpecifiedDialect:      dialecteSmb311,
		},
		Initiator: &smb2.NTLMInitiator{
			User:     s.identifiants.Utilisateur,
			Password: s.identifiants.MotDePasse,
		},
	}
	session, err := numeroteur.Dial(ctx, net.JoinHostPort(s.identifiants.Hote, portSmb))
	if err != nil {
		return err
	}
	partage, err := session.Mount(s.identifiants.Partage)
	if err != nil {
		_ = session.Logoff()
		return err
	}
	s.session, s.partage = session, partage
	return nil
}

// Fermer termine la session. Sans effet si elle est déjà fermée.
func (s *Session) Fermer() {
	if s.partage != nil {
		_ = s.partage.Umount()
		s.partage = nil
	}
	if s.session != nil {
		_ = s.session.Logoff()
		s.session = nil
	}
}

// Ping vérifie que le NAS répond encore.
func (s *Session) Ping() error {
	return s.executer(true, func(*smb2.Share) error { return s.session.Echo() })
}

// InfosSession décrit la protection de la session. Les compteurs viennent du
// correctif de la lib : toutes les réponses doivent être chiffrées.
func (s *Session) InfosSession() protocol.SessionInfo {
	return protocol.SessionInfo{
		Dialecte:          nomDialecteExige,
		Signature:         true,
		Chiffrement:       smb2.ForceEncryption,
		ReponsesChiffrees: smb2.ResponsesEncrypted.Load(),
		ReponsesTotal:     smb2.ResponsesTotal.Load(),
	}
}

// executer lance une opération sur le partage. Si la connexion est tombée, il
// la rouvre et, quand l'opération peut être rejouée sans risque, la relance
// une fois.
func (s *Session) executer(rejouable bool, operation func(*smb2.Share) error) error {
	if s.partage == nil {
		if err := s.connecter(context.Background()); err != nil {
			return err
		}
	}
	ctx, annuler := context.WithTimeout(context.Background(), delaiOperation)
	defer annuler()

	err := operation(s.partage.WithContext(ctx))
	if err == nil || !estCoupure(err) {
		return err
	}

	s.Fermer()
	if errReconnexion := s.connecter(context.Background()); errReconnexion != nil {
		return errReconnexion
	}
	if !rejouable {
		return err
	}
	ctx2, annuler2 := context.WithTimeout(context.Background(), delaiOperation)
	defer annuler2()
	return operation(s.partage.WithContext(ctx2))
}
