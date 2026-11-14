import { appendFileSync, renameSync, statSync } from 'node:fs';

/**
 * Journal des erreurs (docs/spec/architecture.md, « Journal des erreurs ») :
 * plantage de l'affichage, erreur non rattrapée, processus perdu. Un fichier
 * texte dans le profil, lisible tel quel, qui garde un fichier précédent quand
 * il dépasse sa taille. Écrit de façon synchrone : une entrée notée juste avant
 * un plantage doit être sur le disque.
 */

/** Au-delà, le fichier devient `erreurs.1.log` (l'ancien est remplacé) et un nouveau commence. */
export const tailleMaximale = 1024 * 1024;
const longueurMaxDuMessage = 2000;
const longueurMaxDeLaPile = 8000;
/** Une boucle d'erreurs ne remplit pas le disque : au plus tant d'entrées par minute. */
const entreesParMinute = 30;

export interface ErrorEntry {
  /** D'où vient l'erreur : « affichage », « main », « processus », etc. */
  origine: string;
  message: string;
  /** Pile d'appels ou détail, sur plusieurs lignes. */
  detail?: string | undefined;
}

const borner = (texte: string, longueur: number): string => (texte.length > longueur ? `${texte.slice(0, longueur)}… (coupé)` : texte);

/** Texte d'une entrée : date, version, origine et message sur une ligne, puis le détail décalé. */
export function texteDeLEntree(entree: ErrorEntry, version: string, date: Date): string {
  const message = borner(entree.message.replace(/\s+/g, ' ').trim(), longueurMaxDuMessage);
  const lignes = [`${date.toISOString()} [${version}] ${entree.origine} : ${message === '' ? '(sans message)' : message}`];
  const detail = borner((entree.detail ?? '').trim(), longueurMaxDeLaPile);
  if (detail !== '') {
    lignes.push(...detail.split(/\r?\n/).map((ligne) => `    ${ligne}`));
  }
  return `${lignes.join('\n')}\n`;
}

export class ErrorLog {
  private readonly dates: number[] = [];
  private dejaSignale = false;

  constructor(
    private readonly chemin: string,
    private readonly version: string,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  /** Ajoute une entrée. Ne lève jamais : un journal en panne ne doit rien casser de plus. */
  noter(entree: ErrorEntry): void {
    const date = this.maintenant();
    const ilYAUneMinute = date.getTime() - 60_000;
    while (this.dates.length > 0 && this.dates[0]! < ilYAUneMinute) {
      this.dates.shift();
    }
    if (this.dates.length >= entreesParMinute) {
      if (!this.dejaSignale) {
        this.dejaSignale = true;
        this.ecrire(texteDeLEntree({ origine: 'journal', message: `plus de ${entreesParMinute} erreurs en une minute, les suivantes ne sont pas notées` }, this.version, date));
      }
      return;
    }
    this.dejaSignale = false;
    this.dates.push(date.getTime());
    this.ecrire(texteDeLEntree(entree, this.version, date));
  }

  private ecrire(texte: string): void {
    try {
      if (this.taille() + texte.length > tailleMaximale) {
        renameSync(this.chemin, this.chemin.replace(/\.log$/, '.1.log'));
      }
      appendFileSync(this.chemin, texte, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Disque plein, profil en lecture seule : tant pis pour cette entrée.
    }
  }

  private taille(): number {
    try {
      return statSync(this.chemin).size;
    } catch {
      return 0;
    }
  }
}
