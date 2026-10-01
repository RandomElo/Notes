//go:build nas

// Test d'intégration contre le NAS réel. Il n'est jamais lancé par
// « go test ./... » : il faut le tag nas et un terminal pour saisir le mot de
// passe. L'adresse, le partage et l'utilisateur viennent de l'environnement
// (NOTES_NAS_HOTE, NOTES_NAS_PARTAGE, NOTES_NAS_UTILISATEUR), que
// « npm run test:nas » charge depuis le fichier .env de la racine.
package smbfs

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"golang.org/x/term"

	"notes/smb-companion/internal/protocol"
)

func identifiantsDuTest(t *testing.T) protocol.Credentials {
	t.Helper()
	id := protocol.Credentials{
		Hote:        os.Getenv("NOTES_NAS_HOTE"),
		Partage:     os.Getenv("NOTES_NAS_PARTAGE"),
		Utilisateur: os.Getenv("NOTES_NAS_UTILISATEUR"),
	}
	if id.Hote == "" || id.Partage == "" || id.Utilisateur == "" {
		t.Fatal("NOTES_NAS_HOTE, NOTES_NAS_PARTAGE et NOTES_NAS_UTILISATEUR sont à renseigner dans .env (voir .env.example), puis lancer npm run test:nas")
	}
	// Le mot de passe se saisit au clavier, sans écho. go test ne transmet pas
	// l'entrée standard, d'où l'ouverture directe du terminal.
	terminal, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil {
		t.Fatalf("pas de terminal pour saisir le mot de passe : %v", err)
	}
	defer terminal.Close()
	fmt.Fprint(terminal, "Mot de passe du NAS : ")
	saisie, err := term.ReadPassword(int(terminal.Fd()))
	fmt.Fprintln(terminal)
	if err != nil {
		t.Fatalf("lecture du mot de passe : %v", err)
	}
	id.MotDePasse = string(saisie)
	return id
}

func TestNasReel(t *testing.T) {
	session, err := Ouvrir(context.Background(), identifiantsDuTest(t))
	if err != nil {
		t.Fatalf("connexion : %s", VersErreur(err))
	}
	defer session.Fermer()

	dossier := fmt.Sprintf("notes-test-%d", time.Now().UnixMilli())
	fichier := dossier + "/sous-dossier/page.md"
	renomme := dossier + "/sous-dossier/page-renommee.md"
	contenu := []byte("Notes, test d'intégration du compagnon SMB\n")

	etape := func(nom string, err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("%s : %s", nom, VersErreur(err))
		}
	}

	etape("création du dossier et de son parent", session.CreerDossier(dossier+"/sous-dossier"))
	etape("création d'un dossier existant", session.CreerDossier(dossier))
	etape("écriture", session.Ecrire(fichier, contenu))

	relu, err := session.Lire(fichier)
	etape("lecture", err)
	if !bytes.Equal(relu, contenu) {
		t.Fatalf("contenu relu différent : %q", relu)
	}

	infos, err := session.Infos(fichier)
	etape("métadonnées", err)
	if infos == nil || infos.EstDossier || infos.Taille != int64(len(contenu)) {
		t.Fatalf("métadonnées inattendues : %+v", infos)
	}
	if ecart := time.Since(time.UnixMilli(infos.ModifieLe)); ecart < -5*time.Minute || ecart > 5*time.Minute {
		t.Errorf("date de modification suspecte, écart de %s avec l'horloge du poste", ecart)
	}

	absent, err := session.Infos(dossier + "/absent.md")
	etape("métadonnées d'un fichier absent", err)
	if absent != nil {
		t.Fatalf("un fichier absent doit donner nil, reçu %+v", absent)
	}
	if _, err := session.Lire(dossier + "/absent.md"); VersErreur(err).Code != protocol.ErrIntrouvable {
		t.Fatalf("lire un fichier absent doit donner %q, reçu %v", protocol.ErrIntrouvable, err)
	}

	etape("renommage", session.Renommer(fichier, renomme))
	entrees, err := session.Lister(dossier + "/sous-dossier")
	etape("liste", err)
	if len(entrees) != 1 || entrees[0].Nom != "page-renommee.md" {
		t.Fatalf("liste inattendue : %+v", entrees)
	}
	racine, err := session.Lister("")
	etape("liste de la racine", err)
	t.Logf("racine du partage : %d entrées", len(racine))

	etape("ping", session.Ping())

	if err := session.Supprimer(dossier); VersErreur(err).Code != protocol.ErrDossierNonVide {
		t.Errorf("supprimer un dossier non vide doit donner %q, reçu %v", protocol.ErrDossierNonVide, err)
	}
	etape("suppression du fichier", session.Supprimer(renomme))
	etape("suppression du sous-dossier", session.Supprimer(dossier+"/sous-dossier"))
	etape("suppression du dossier", session.Supprimer(dossier))

	protection := session.InfosSession()
	t.Logf("réponses chiffrées : %d sur %d", protection.ReponsesChiffrees, protection.ReponsesTotal)
	if protection.ReponsesTotal == 0 || protection.ReponsesChiffrees != protection.ReponsesTotal {
		t.Fatalf("toutes les réponses doivent être chiffrées : %d sur %d",
			protection.ReponsesChiffrees, protection.ReponsesTotal)
	}
}

func TestNasMauvaisMotDePasse(t *testing.T) {
	id := protocol.Credentials{
		Hote:        os.Getenv("NOTES_NAS_HOTE"),
		Partage:     os.Getenv("NOTES_NAS_PARTAGE"),
		Utilisateur: os.Getenv("NOTES_NAS_UTILISATEUR"),
		MotDePasse:  "mot-de-passe-volontairement-faux",
	}
	_, err := Ouvrir(context.Background(), id)
	if VersErreur(err).Code != protocol.ErrIdentifiantsRefuses {
		t.Fatalf("un mauvais mot de passe doit donner %q, reçu %v", protocol.ErrIdentifiantsRefuses, err)
	}
}
