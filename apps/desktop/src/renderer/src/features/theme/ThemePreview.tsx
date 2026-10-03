import { classeDePage } from '@notes/ui';

/** Un bout de page d'exemple, rendu avec les styles du contenu : on voit l'effet d'un réglage sans quitter les réglages. */
export function ThemePreview() {
  return (
    <div aria-label="Aperçu du thème" className={`${classeDePage} bg-fond rounded-lg p-4`}>
      <h1>Titre 1</h1>
      <h2>Titre 2</h2>
      <h3>Titre 3</h3>
      <h4>Titre 4</h4>
      <h5>Titre 5</h5>
      <p>
        Un paragraphe avec du <strong>gras</strong>, de l'<em>italique</em>, du <code>code</code> et un <a>lien</a>.
      </p>
      <ul>
        <li>
          <p>Puce de niveau 1</p>
          <ul>
            <li>
              <p>Puce de niveau 2</p>
              <ul>
                <li>
                  <p>Puce de niveau 3</p>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
      <pre>
        <code>const reponse = 42;</code>
      </pre>
    </div>
  );
}
