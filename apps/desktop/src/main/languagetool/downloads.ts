/**
 * Ce que l'installation de la correction orthographique télécharge (docs/spec/correction.md).
 * Chaque fichier est à une version fixée et vérifié par son empreinte SHA-256
 * avant d'être décompressé : une archive modifiée en route n'est jamais ouverte.
 * Changer une version, c'est changer l'adresse, la taille et l'empreinte ensemble,
 * et `versionsInitiales` (`versions.ts`). Les mises à jour suivantes passent par `updater.ts`.
 */
export interface ArchiveATelecharger {
  /** Nom du dossier où elle est décompressée, dans le dossier de LanguageTool. */
  dossier: 'java' | 'languagetool' | 'ngrammes';
  /** Ce que montre l'écran d'installation. */
  libelle: string;
  adresse: string;
  taille: number;
  empreinte: string;
  format: 'tar.gz' | 'zip';
  /** Niveaux de dossiers retirés en tête des chemins de l'archive (`jdk-17…-jre/bin/java` → `bin/java`). */
  niveauxRetires: number;
}

export const archives: readonly ArchiveATelecharger[] = [
  {
    dossier: 'java',
    libelle: 'Java (Temurin 17)',
    adresse: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jre_x64_linux_hotspot_17.0.20.1_1.tar.gz',
    taille: 46_640_574,
    empreinte: '0b2b640e3046b64c8ec504de0ab9d91bb5610182bda21fad454681ce54d45a62',
    format: 'tar.gz',
    niveauxRetires: 1,
  },
  {
    dossier: 'languagetool',
    libelle: 'LanguageTool 6.6',
    adresse: 'https://languagetool.org/download/LanguageTool-6.6.zip',
    taille: 251_998_221,
    empreinte: '53600506b399bb5ffe1e4c8dec794fd378212f14aaf38ccef9b6f89314d11631',
    format: 'zip',
    niveauxRetires: 1,
  },
  {
    dossier: 'ngrammes',
    libelle: 'N-grammes français',
    adresse: 'https://languagetool.org/download/ngram-data/ngrams-fr-20150913.zip',
    taille: 1_824_051_147,
    empreinte: '6e591d5b301b76d595342217bddda6804e515307ef28019d7256efadbd5880cd',
    format: 'zip',
    // Gardé tel quel : LanguageTool attend un dossier qui contient `fr/`.
    niveauxRetires: 0,
  },
];
