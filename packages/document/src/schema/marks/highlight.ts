import { Highlight as Surlignage } from '@tiptap/extension-highlight';

/** Surlignage `==texte==`, une seule couleur (celle du thème). */
export const Highlight = Surlignage.configure({ multicolor: false });
