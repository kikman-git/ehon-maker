export interface LibraryPart { partId: string; masterRef: string; w: number; h: number; title: string }
export interface LibraryState { owner: string | null; parts: LibraryPart[] }

/** Something the painter can register parts with: an editor or a reader. */
export interface PartTarget {
  registerPart(partId: string, assetRef: string, aspect: number, nameJa: string, nameEn: string): void;
}

const REF = /^a\/[0-9a-f]{64}$/;

/** An `illustrations` document (or a guest-link part) as a `lib:` part, or null when malformed. */
export function libraryPart(id: string, data: Record<string, unknown>): LibraryPart | null {
  const masterRef = data.masterRef;
  const w = Number(data.w);
  const h = Number(data.h);
  if (typeof masterRef !== 'string' || !REF.test(masterRef) || !(w > 0) || !(h > 0)) return null;
  return { partId: `lib:${id}`, masterRef, w, h, title: typeof data.title === 'string' ? data.title : '' };
}

export function registerParts(target: PartTarget, parts: Iterable<LibraryPart>): void {
  for (const part of parts) target.registerPart(part.partId, part.masterRef, part.w / part.h, part.title, part.title);
}
