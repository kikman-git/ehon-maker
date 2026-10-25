// Mirrors the harness's limits (backend/functions/src/atelier.ts, agent.ts) so a turn never carries what the server would drop.
export const MAX_SVG_CHARS = 8_000;
export const MAX_BOOK_ART = 6;
export const MAX_IMAGE_CHARS = Math.floor(1_500_000 * 4 / 3);
export const MAX_REQUEST_CHARS = 10_000;
const SVG_FORBIDDEN = /<\s*(script|image|use|foreignObject|text|style|iframe|a)\b|\bhref\s*=|\son[a-z]+\s*=|javascript:|url\(/i;

export const plainSvg = (svg: unknown): svg is string =>
  typeof svg === 'string' && svg.length <= MAX_SVG_CHARS && /^\s*<svg[\s>]/.test(svg) && /<\/svg>\s*$/.test(svg) && !SVG_FORBIDDEN.test(svg);

/** The book's pictures the model may look at for style: plain SVG only, a handful at most. */
export const referenceArt = (svgs: unknown[]): string[] => svgs.filter(plainSvg).slice(0, MAX_BOOK_ART);
