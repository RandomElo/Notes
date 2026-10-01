// Package protocol décrit les messages échangés avec le main d'Electron :
// une requête JSON par ligne sur l'entrée standard, une réponse JSON par ligne
// sur la sortie standard. Le miroir TypeScript est dans
// apps/desktop/src/main/smb/protocol.ts : les deux se modifient ensemble.
package protocol

// Opérations acceptées.
const (
	OpConnecter    = "connecter"
	OpDeconnecter  = "deconnecter"
	OpPing         = "ping"
	OpInfosSession = "infosSession"
	OpInfos        = "infos"
	OpLister       = "lister"
	OpLire         = "lire"
	OpEcrire       = "ecrire"
	OpCreerDossier = "creerDossier"
	OpRenommer     = "renommer"
	OpSupprimer    = "supprimer"
)

// Codes d'erreur renvoyés au main.
const (
	ErrInjoignable         = "injoignable"
	ErrIdentifiantsRefuses = "identifiants_refuses"
	ErrPartageIntrouvable  = "partage_introuvable"
	ErrChiffrementAbsent   = "chiffrement_absent"
	ErrIntrouvable         = "introuvable"
	ErrExisteDeja          = "existe_deja"
	ErrDossierNonVide      = "dossier_non_vide"
	ErrAccesRefuse         = "acces_refuse"
	ErrNonConnecte         = "non_connecte"
	ErrRequeteInvalide     = "requete_invalide"
	ErrInterne             = "interne"
)

// Request est une requête du main. Les champs inutiles à l'opération restent vides.
// Elle peut porter le mot de passe : ne jamais la journaliser.
type Request struct {
	ID int64  `json:"id"`
	Op string `json:"op"`

	// connecter
	Hote        string `json:"hote,omitempty"`
	Partage     string `json:"partage,omitempty"`
	Utilisateur string `json:"utilisateur,omitempty"`
	MotDePasse  string `json:"motDePasse,omitempty"`

	// opérations sur les fichiers : chemins relatifs à la racine du partage, séparés par "/"
	Chemin  string `json:"chemin,omitempty"`
	Vers    string `json:"vers,omitempty"`    // renommer
	Contenu string `json:"contenu,omitempty"` // ecrire, en base64
}

// Response répond à la requête de même ID.
type Response struct {
	ID       int64      `json:"id"`
	Ok       bool       `json:"ok"`
	Resultat any        `json:"resultat,omitempty"`
	Erreur   *ErrorBody `json:"erreur,omitempty"`
}

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error permet de faire circuler un ErrorBody comme une erreur Go.
func (e *ErrorBody) Error() string { return e.Code + " : " + e.Message }

// Credentials regroupe ce qu'il faut pour ouvrir une session.
type Credentials struct {
	Hote        string
	Partage     string
	Utilisateur string
	MotDePasse  string
}

// Entry décrit un fichier ou un dossier distant.
type Entry struct {
	Nom        string `json:"nom"`
	EstDossier bool   `json:"estDossier"`
	Taille     int64  `json:"taille"`
	ModifieLe  int64  `json:"modifieLe"` // millisecondes depuis l'époque Unix
}

// SessionInfo décrit la session ouverte, pour vérifier qu'elle est bien protégée.
type SessionInfo struct {
	Dialecte          string `json:"dialecte"`
	Signature         bool   `json:"signature"`
	Chiffrement       bool   `json:"chiffrement"`
	ReponsesChiffrees int64  `json:"reponsesChiffrees"`
	ReponsesTotal     int64  `json:"reponsesTotal"`
}

// ReadResult est le résultat de l'opération lire.
type ReadResult struct {
	Contenu string `json:"contenu"` // base64
}

// ListResult est le résultat de l'opération lister.
type ListResult struct {
	Entrees []Entry `json:"entrees"`
}

// StatResult est le résultat de l'opération infos. Entree est nul si le chemin n'existe pas.
type StatResult struct {
	Entree *Entry `json:"entree"`
}
