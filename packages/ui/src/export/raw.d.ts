// Vite (et Vitest) remplacent l'import d'une feuille de style suivie de `?raw` par son texte.
declare module '*.css?raw' {
  const texte: string;
  export default texte;
}
