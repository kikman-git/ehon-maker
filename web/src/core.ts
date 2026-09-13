import { EhonCodec, WebEditor, WebReader } from '@ehon/core';
import { createStore } from './cloud/store';
import { fontFaces, fontRanges } from './fonts.generated';

export const codec = EhonCodec.getInstance();
export { WebEditor, WebReader };

const fontsBase = (import.meta.env.VITE_FONTS_URL || `${import.meta.env.BASE_URL}fonts`).replace(/\/$/, '');

/** Bumped when a batch of font slices has landed: canvases re-measure and repaint once. */
export const fonts = createStore({ epoch: 0 });

/**
 * Registers every face as unicode-range slices (decision 49) and waits only for the kana
 * slices of the body and UI faces; kanji blocks load as books and typing need them.
 */
export async function loadFonts(): Promise<void> {
  const eager: FontFace[] = [];
  for (const face of fontFaces) {
    if (face.id === 'ui') continue; // Web controls use the platform's readable sans-serif UI face.
    for (const [bucket, hash] of Object.entries(face.files)) {
      const range = face.ranges[bucket] ?? fontRanges[bucket];
      const font = new FontFace(`Ehon-${face.id}`, `url(${fontsBase}/${face.id}-${bucket}.${hash}.woff2)`, { unicodeRange: range, display: 'swap' });
      document.fonts.add(font);
      if (face.eager.includes(bucket)) eager.push(font);
    }
  }
  document.fonts.addEventListener('loadingdone', () => fonts.update({ epoch: fonts.get().epoch + 1 }));
  await Promise.allSettled(eager.map((font) => font.load()));
}

/** Starts loading the slices each face needs for its text; resolves when they are usable. */
export function ensureGlyphs(textByFace: Record<string, string>): Promise<void> {
  const loads = Object.entries(textByFace).map(([id, text]) => (text ? document.fonts.load(`16px "Ehon-${id}"`, text).catch(() => []) : Promise.resolve([])));
  return Promise.all(loads).then(() => undefined);
}

export const bookGlyphs = (json: string): Promise<void> => ensureGlyphs(JSON.parse(codec.textByFace(json)) as Record<string, string>);

/** One hidden 2D context measures text for every editor and reader on the page. */
const measureContext = (() => {
  let context: CanvasRenderingContext2D | null = null;
  return () => {
    context ??= document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('Canvas2D is unavailable.');
    return context;
  };
})();

export function measureText(text: string, size: number, face: string): number {
  const context = measureContext();
  context.font = codec.canvasFont(size, face);
  return context.measureText(text).width;
}

export function createEditor(json: string): WebEditor {
  return new WebEditor(json, measureText);
}

export function createReader(json: string): WebReader {
  return new WebReader(json, measureText);
}

export function blankBook(shape = 'SQUARE'): string {
  return codec.blankBook(`b-${crypto.randomUUID()}`, '無題のえほん', 'ja-JP', Date.now(), shape);
}

export const parts: { id: string; name: string; category: string }[] = JSON.parse(codec.catalogJson('ja'));
export const fontChoices: { id: string; name: string }[] = JSON.parse(codec.fontsJson('ja'));
export const backgrounds: number[] = JSON.parse(codec.backgroundsJson());
export const drawingColors: number[] = JSON.parse(codec.drawingColorsJson());
export const cssColor = (argb: number) => `#${(argb >>> 0).toString(16).padStart(8, '0').slice(2)}`;
