# Corbeille

Desktop uniquement. La corbeille est sur le NAS (`.trash/`), sans copie locale. Supprimer une page déplace son dossier complet (enfants inclus) vers un dossier horodaté, avec un `.trashmeta.yaml` (chemin d'origine, date, UUID du parent).

Une image retirée d'une page (son fichier dans `assets/` n'étant plus utilisé) part aussi dans la corbeille.

Supprimer se fait par le menu de l'arborescence ou `Suppr` sur la page choisie, et s'applique à toutes les pages sélectionnées (sélection multiple, ci-dessous).

Sélection multiple dans l'arborescence : `Maj+↑/↓` étend la sélection depuis la page choisie, `Maj+clic` prend toutes les pages entre la page choisie et celle cliquée ; `Ctrl+clic` garde son rôle (nouvel onglet). La sélection se montre par le fond. `Échap` ou un simple clic la défait. Les pages choisies se suppriment ensemble (`Suppr` ou « Mettre à la corbeille » dans le menu) et se déplacent ensemble par glisser-déposer, dans leur ordre d'affichage. Une page choisie avec une de ses sous-pages emmène celle-ci : la sous-page n'est pas traitée à part. Pas d'export de plusieurs pages.

Déroulé d'une suppression : la page part d'abord dans un `.trash/` du dossier des notes sur le poste, que la sync ne transporte pas, puis disparaît de l'arborescence. Au cycle suivant, la sync la retire du NAS comme toute page supprimée, dépose l'entrée dans le `.trash/` du NAS, puis la retire du poste. Un fichier de la page modifié sur l'autre appareil entre-temps revient, comme pour toute suppression ([sync](sync.md)). La page ouverte est enregistrée avant d'être mise à la corbeille, et son onglet se vide. Pas de confirmation, la page se restaure, sauf quand une des pages a des sous-pages : une petite fenêtre à côté de la ligne dit combien partent avec elle (`Entrée` confirme, `Échap` abandonne).

Écran de la corbeille : il remplace la page au centre, comme les réglages, par une ligne en bas de la barre latérale ; `Échap` rend la page. Liste des entrées (les plus récentes en haut, celles du NAS et celles encore sur le poste), aperçu en lecture seule de l'entrée choisie, « Restaurer », « Supprimer définitivement » (confirmation), « Vider la corbeille » (confirmation). NAS injoignable, la liste montre les entrées du poste et le dit. Une page restaurée revient sous son parent d'origine (retrouvé par son identifiant, même déplacé), à sa place parmi ses sœurs (avant celle qui la suivait, sinon après celle qui la précédait, sinon à son ancien rang), à la racine et en dernier si son parent n'existe plus, avec ses sous-pages, ses images et son identifiant : ses mentions remarchent. Une image revient dans le dossier `assets/` de sa page.

Images inutilisées : dans les réglages, chacune a un bouton « Mettre à la corbeille », et « Tout mettre à la corbeille » les envoie toutes d'un coup, après confirmation à côté du bouton.

Rétention de 30 jours, purge automatique au démarrage. Interface : liste, prévisualisation, restaurer, supprimer définitivement (confirmation requise), vider. Si le NAS est injoignable, corbeille locale temporaire transférée au cycle suivant.


