// markdown-it-mark n'a pas de types : c'est un simple greffon de markdown-it.
declare module 'markdown-it-mark' {
  import type { PluginSimple } from 'markdown-it';
  const greffon: PluginSimple;
  export default greffon;
}
