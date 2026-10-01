package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"notes/smb-companion/internal/protocol"
)

// fauxBackend garde les fichiers en mémoire.
type fauxBackend struct {
	fichiers map[string][]byte
	ferme    bool
}

func (f *fauxBackend) Ping() error { return nil }
func (f *fauxBackend) InfosSession() protocol.SessionInfo {
	return protocol.SessionInfo{Dialecte: "SMB 3.1.1", Signature: true, Chiffrement: true}
}
func (f *fauxBackend) Infos(chemin string) (*protocol.Entry, error) {
	contenu, existe := f.fichiers[chemin]
	if !existe {
		return nil, nil
	}
	return &protocol.Entry{Nom: chemin, Taille: int64(len(contenu))}, nil
}
func (f *fauxBackend) Lister(string) ([]protocol.Entry, error) {
	entrees := []protocol.Entry{}
	for nom := range f.fichiers {
		entrees = append(entrees, protocol.Entry{Nom: nom})
	}
	return entrees, nil
}
func (f *fauxBackend) Lire(chemin string) ([]byte, error) {
	contenu, existe := f.fichiers[chemin]
	if !existe {
		return nil, os.ErrNotExist
	}
	return contenu, nil
}
func (f *fauxBackend) Ecrire(chemin string, contenu []byte) error {
	f.fichiers[chemin] = contenu
	return nil
}
func (f *fauxBackend) CreerDossier(string) error { return nil }
func (f *fauxBackend) Renommer(chemin, vers string) error {
	f.fichiers[vers] = f.fichiers[chemin]
	delete(f.fichiers, chemin)
	return nil
}
func (f *fauxBackend) Supprimer(chemin string) error {
	delete(f.fichiers, chemin)
	return nil
}
func (f *fauxBackend) Fermer() { f.ferme = true }

func traduireTest(err error) *protocol.ErrorBody {
	if corps, ok := err.(*protocol.ErrorBody); ok {
		return corps
	}
	if err == os.ErrNotExist {
		return &protocol.ErrorBody{Code: protocol.ErrIntrouvable, Message: "introuvable"}
	}
	return &protocol.ErrorBody{Code: protocol.ErrInterne, Message: err.Error()}
}

// dialoguer envoie les requêtes et renvoie les réponses décodées.
func dialoguer(t *testing.T, backend *fauxBackend, lignes ...string) ([]protocol.Response, protocol.Credentials) {
	t.Helper()
	var recus protocol.Credentials
	connecter := func(_ context.Context, identifiants protocol.Credentials) (Backend, error) {
		recus = identifiants
		return backend, nil
	}
	var sortie bytes.Buffer
	entree := strings.NewReader(strings.Join(lignes, "\n") + "\n")
	if err := Nouveau(connecter, traduireTest).Servir(entree, &sortie); err != nil {
		t.Fatalf("Servir : %v", err)
	}
	var reponses []protocol.Response
	for _, ligne := range strings.Split(strings.TrimSpace(sortie.String()), "\n") {
		var reponse protocol.Response
		if err := json.Unmarshal([]byte(ligne), &reponse); err != nil {
			t.Fatalf("réponse illisible %q : %v", ligne, err)
		}
		reponses = append(reponses, reponse)
	}
	return reponses, recus
}

const connexion = `{"id":1,"op":"connecter","hote":"nas","partage":"p","utilisateur":"u","motDePasse":"secret"}`

func TestEcrirePuisLire(t *testing.T) {
	backend := &fauxBackend{fichiers: map[string][]byte{}}
	contenu := base64.StdEncoding.EncodeToString([]byte("bonjour"))
	reponses, recus := dialoguer(t, backend,
		connexion,
		`{"id":2,"op":"ecrire","chemin":"a/page.md","contenu":"`+contenu+`"}`,
		`{"id":3,"op":"lire","chemin":"a/page.md"}`,
	)
	if recus.MotDePasse != "secret" || recus.Hote != "nas" {
		t.Fatalf("identifiants mal transmis : %+v", recus)
	}
	if len(reponses) != 3 {
		t.Fatalf("3 réponses attendues, %d reçues", len(reponses))
	}
	for i, reponse := range reponses {
		if !reponse.Ok || reponse.ID != int64(i+1) {
			t.Fatalf("réponse %d inattendue : %+v", i, reponse)
		}
	}
	resultat := reponses[2].Resultat.(map[string]any)
	if resultat["contenu"] != contenu {
		t.Fatalf("contenu relu différent : %v", resultat["contenu"])
	}
}

func TestOperationSansSession(t *testing.T) {
	reponses, _ := dialoguer(t, &fauxBackend{}, `{"id":7,"op":"lire","chemin":"x"}`)
	if reponses[0].Ok || reponses[0].Erreur.Code != protocol.ErrNonConnecte || reponses[0].ID != 7 {
		t.Fatalf("réponse inattendue : %+v", reponses[0])
	}
}

func TestErreursDeRequete(t *testing.T) {
	backend := &fauxBackend{fichiers: map[string][]byte{}}
	reponses, _ := dialoguer(t, backend,
		`pas du json`,
		connexion,
		`{"id":2,"op":"inconnue"}`,
		`{"id":3,"op":"ecrire","chemin":"x","contenu":"###"}`,
		`{"id":4,"op":"lire","chemin":"absent"}`,
	)
	attendus := []string{protocol.ErrRequeteInvalide, "", protocol.ErrRequeteInvalide, protocol.ErrRequeteInvalide, protocol.ErrIntrouvable}
	for i, code := range attendus {
		if code == "" {
			if !reponses[i].Ok {
				t.Fatalf("réponse %d : succès attendu, reçu %+v", i, reponses[i].Erreur)
			}
			continue
		}
		if reponses[i].Ok || reponses[i].Erreur.Code != code {
			t.Fatalf("réponse %d : code %q attendu, reçu %+v", i, code, reponses[i])
		}
	}
}

func TestInfosCheminAbsent(t *testing.T) {
	backend := &fauxBackend{fichiers: map[string][]byte{}}
	reponses, _ := dialoguer(t, backend, connexion, `{"id":2,"op":"infos","chemin":"absent"}`)
	resultat := reponses[1].Resultat.(map[string]any)
	if !reponses[1].Ok || resultat["entree"] != nil {
		t.Fatalf("entrée nulle attendue : %+v", reponses[1])
	}
}

func TestSessionFermeeEnFinDEntree(t *testing.T) {
	backend := &fauxBackend{fichiers: map[string][]byte{}}
	dialoguer(t, backend, connexion)
	if !backend.ferme {
		t.Fatal("la session doit être fermée quand l'entrée se termine")
	}
}

func TestLeMotDePasseNeRevientJamais(t *testing.T) {
	backend := &fauxBackend{fichiers: map[string][]byte{}}
	connecter := func(context.Context, protocol.Credentials) (Backend, error) { return backend, nil }
	var sortie bytes.Buffer
	entree := strings.NewReader(connexion + "\n" + `{"id":2,"op":"infosSession"}` + "\n")
	if err := Nouveau(connecter, traduireTest).Servir(entree, &sortie); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sortie.String(), "secret") {
		t.Fatalf("le mot de passe apparaît dans la sortie : %s", sortie.String())
	}
}
