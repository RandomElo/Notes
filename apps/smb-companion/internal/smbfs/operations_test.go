package smbfs

import (
	"regexp"
	"testing"
)

func TestNomTemporaire(t *testing.T) {
	motif := regexp.MustCompile(`^Projets\\Alpha\\\.page\.md\.[0-9a-f]{12}\.tmp$`)
	nom, err := nomTemporaire(`Projets\Alpha\page.md`)
	if err != nil || !motif.MatchString(nom) {
		t.Fatalf("nom temporaire inattendu : %q (%v)", nom, err)
	}
	racine, _ := nomTemporaire(`page.md`)
	if !regexp.MustCompile(`^\.page\.md\.[0-9a-f]{12}\.tmp$`).MatchString(racine) {
		t.Fatalf("nom temporaire à la racine inattendu : %q", racine)
	}
	autre, _ := nomTemporaire(`page.md`)
	if autre == racine {
		t.Fatal("deux noms temporaires identiques")
	}
}
