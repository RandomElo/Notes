// Package server lit les requêtes du main ligne par ligne, les exécute dans
// l'ordre et écrit une réponse par requête. Il ne journalise rien : une
// requête peut porter le mot de passe.
package server

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"

	"notes/smb-companion/internal/protocol"
)

// tailleMaxLigne borne une requête (contenu d'un fichier en base64 compris).
const tailleMaxLigne = 96 << 20

// Backend est ce que le serveur attend d'une session SMB ouverte.
type Backend interface {
	Ping() error
	InfosSession() protocol.SessionInfo
	Infos(chemin string) (*protocol.Entry, error)
	Lister(chemin string) ([]protocol.Entry, error)
	Lire(chemin string) ([]byte, error)
	Ecrire(chemin string, contenu []byte) error
	CreerDossier(chemin string) error
	Renommer(chemin, vers string) error
	Supprimer(chemin string) error
	Fermer()
}

// Connector ouvre une session.
type Connector func(ctx context.Context, identifiants protocol.Credentials) (Backend, error)

// ErrorMapper traduit une erreur du backend en erreur du protocole.
type ErrorMapper func(err error) *protocol.ErrorBody

type Server struct {
	connecter Connector
	traduire  ErrorMapper
	session   Backend
}

func Nouveau(connecter Connector, traduire ErrorMapper) *Server {
	return &Server{connecter: connecter, traduire: traduire}
}

// Servir traite les requêtes jusqu'à la fin de l'entrée, puis ferme la
// session. La fin de l'entrée est le signal d'arrêt : si le main disparaît,
// le compagnon s'arrête avec lui.
func (s *Server) Servir(entree io.Reader, sortie io.Writer) error {
	defer s.fermer()

	lecteur := bufio.NewReaderSize(entree, 64<<10)
	encodeur := json.NewEncoder(sortie)

	for {
		ligne, err := lireLigne(lecteur)
		if len(ligne) > 0 {
			if errEcriture := encodeur.Encode(s.traiterLigne(ligne)); errEcriture != nil {
				return errEcriture
			}
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

func lireLigne(lecteur *bufio.Reader) ([]byte, error) {
	var ligne []byte
	for {
		morceau, err := lecteur.ReadSlice('\n')
		ligne = append(ligne, morceau...)
		if len(ligne) > tailleMaxLigne {
			return nil, errors.New("requête trop longue")
		}
		if errors.Is(err, bufio.ErrBufferFull) {
			continue
		}
		return ligne, err
	}
}

func (s *Server) traiterLigne(ligne []byte) protocol.Response {
	var requete protocol.Request
	if err := json.Unmarshal(ligne, &requete); err != nil {
		return echec(0, &protocol.ErrorBody{Code: protocol.ErrRequeteInvalide, Message: "JSON illisible"})
	}
	resultat, err := s.executer(requete)
	if err != nil {
		return echec(requete.ID, s.traduire(err))
	}
	return protocol.Response{ID: requete.ID, Ok: true, Resultat: resultat}
}

func (s *Server) executer(requete protocol.Request) (any, error) {
	switch requete.Op {
	case protocol.OpConnecter:
		return nil, s.ouvrir(requete)
	case protocol.OpDeconnecter:
		s.fermer()
		return nil, nil
	}

	if s.session == nil {
		return nil, &protocol.ErrorBody{Code: protocol.ErrNonConnecte, Message: "aucune session ouverte"}
	}

	switch requete.Op {
	case protocol.OpPing:
		return nil, s.session.Ping()
	case protocol.OpInfosSession:
		return s.session.InfosSession(), nil
	case protocol.OpInfos:
		entree, err := s.session.Infos(requete.Chemin)
		return protocol.StatResult{Entree: entree}, err
	case protocol.OpLister:
		entrees, err := s.session.Lister(requete.Chemin)
		return protocol.ListResult{Entrees: entrees}, err
	case protocol.OpLire:
		contenu, err := s.session.Lire(requete.Chemin)
		if err != nil {
			return nil, err
		}
		return protocol.ReadResult{Contenu: base64.StdEncoding.EncodeToString(contenu)}, nil
	case protocol.OpEcrire:
		contenu, err := base64.StdEncoding.DecodeString(requete.Contenu)
		if err != nil {
			return nil, &protocol.ErrorBody{Code: protocol.ErrRequeteInvalide, Message: "contenu base64 illisible"}
		}
		return nil, s.session.Ecrire(requete.Chemin, contenu)
	case protocol.OpCreerDossier:
		return nil, s.session.CreerDossier(requete.Chemin)
	case protocol.OpRenommer:
		return nil, s.session.Renommer(requete.Chemin, requete.Vers)
	case protocol.OpSupprimer:
		return nil, s.session.Supprimer(requete.Chemin)
	}
	return nil, &protocol.ErrorBody{Code: protocol.ErrRequeteInvalide, Message: "opération inconnue"}
}

func (s *Server) ouvrir(requete protocol.Request) error {
	s.fermer()
	session, err := s.connecter(context.Background(), protocol.Credentials{
		Hote:        requete.Hote,
		Partage:     requete.Partage,
		Utilisateur: requete.Utilisateur,
		MotDePasse:  requete.MotDePasse,
	})
	if err != nil {
		return err
	}
	s.session = session
	return nil
}

func (s *Server) fermer() {
	if s.session != nil {
		s.session.Fermer()
		s.session = nil
	}
}

func echec(id int64, erreur *protocol.ErrorBody) protocol.Response {
	return protocol.Response{ID: id, Ok: false, Erreur: erreur}
}
