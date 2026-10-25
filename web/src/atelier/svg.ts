import type { Part } from './prompt';

const SHAPES = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop']);

/**
 * The AI's SVG reduced to inert geometry for hit-testing: no scripts, styles, links or handlers.
 * The painter draws the picture; this copy is only ever transparent.
 */
export function inertSvg(svg: string): SVGSVGElement | null {
  // The HTML parser puts <svg> in the SVG namespace even without xmlns, which AI-written art often omits.
  const root = new DOMParser().parseFromString(svg, 'text/html').body.querySelector('svg');
  if (!root) return null;
  const strip = (element: Element) => {
    for (const child of [...element.children]) {
      if (!SHAPES.has(child.localName)) child.remove();
      else strip(child);
    }
    for (const attribute of [...element.attributes]) {
      if (/^on|href$|^style$/i.test(attribute.localName)) element.removeAttribute(attribute.name);
    }
    // Ids move to data-part so the AI's names never collide with the studio's own element ids.
    if (element.id) {
      if (element.localName === 'g') element.setAttribute('data-part', element.id);
      element.removeAttribute('id');
    }
  };
  strip(root);
  const inert = document.importNode(root, true) as unknown as SVGSVGElement;
  inert.setAttribute('width', '100%');
  inert.setAttribute('height', '100%');
  return inert;
}

/** The tappable parts: every `<g id>` of the AI's SVG, named by its `data-name` when the AI gave one. */
export function partsOf(svg: SVGSVGElement | null): Part[] {
  if (!svg) return [];
  return [...svg.querySelectorAll('g[data-part]')].map((group) => {
    const id = group.getAttribute('data-part')!;
    return { id, name: group.getAttribute('data-name')?.trim() || id };
  });
}

/** The smallest part whose box holds the point, so a tap on an eye picks the eye rather than the head. */
export function partAt(svg: SVGSVGElement, x: number, y: number): string | null {
  let best: { id: string; area: number } | null = null;
  for (const group of svg.querySelectorAll('g[data-part]')) {
    const box = group.getBoundingClientRect();
    if (!box.width || !box.height || x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
    const area = box.width * box.height;
    if (!best || area < best.area) best = { id: group.getAttribute('data-part')!, area };
  }
  return best?.id ?? null;
}
