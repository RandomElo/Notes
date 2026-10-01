package smbfs

import "testing"

func TestVersCheminSmb(t *testing.T) {
	valides := map[string]string{
		"page.md":                `page.md`,
		"Projets/page.md":        `Projets\page.md`,
		"Projets/Refonte du NAS": `Projets\Refonte du NAS`,
		".notes/theme.toml":      `.notes\theme.toml`,
		"Été/ça.md":              `Été\ça.md`,
	}
	for chemin, attendu := range valides {
		obtenu, err := versCheminSmb(chemin, false)
		if err != nil || obtenu != attendu {
			t.Errorf("%q : obtenu %q, %v ; attendu %q", chemin, obtenu, err, attendu)
		}
	}

	refuses := []string{
		"", "..", "a/../b", "../secret", "/absolu", "a/", "a//b", "./a",
		`a\b`, "a:b", "a*b", "a?b", `a"b`, "a<b", "a>b", "a|b", "a\x00b",
		"fin.", "fin ", "a/fin./b",
	}
	for _, chemin := range refuses {
		if _, err := versCheminSmb(chemin, false); err == nil {
			t.Errorf("%q devrait être refusé", chemin)
		}
	}
}

func TestRacinePermise(t *testing.T) {
	if chemin, err := versCheminSmb("", true); err != nil || chemin != "" {
		t.Fatalf("la racine doit être acceptée quand elle est permise : %q, %v", chemin, err)
	}
}
