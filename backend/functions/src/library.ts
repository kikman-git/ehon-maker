import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Agent } from './agent';
import type { AssetService } from './assets';
import { MATERIALS, STYLE_DIRECTION, type Material } from './materials';
import type { ImageModel } from './painter';

// The painted library for the book harness (decision #70): looked up by word when the story needs a character, and extended with a new pose painted from that character's own prompt.

export const LIBRARY_PREFIX = 'pack.storybook:';
export const MAX_CHARACTERS_FOUND = 8;
export const MAX_WORDS = 12;

const byId = new Map(MATERIALS.map(material => [material.id, material]));
/** Every id the painter resolves to a library picture: the current ids and the aliases saved books still carry. */
export const MATERIAL_IDS = new Set(MATERIALS.flatMap(material => [material.id, ...material.legacyIds]));
export const materialOf = (slug: string): Material | undefined => byId.get(LIBRARY_PREFIX + slug);

export interface Character { character: string; name: string; category: string; /** How the character was described when it was painted. */ look: string; pictures: { slug: string; name: string; pose: string }[] }

const matches = (term: string, text: string) => (/^[a-z0-9 -]+$/.test(term) ? new RegExp(`\\b${term.replace(/[-\s]+/g, '[- ]')}\\b`).test(text) : text.includes(term));

/** The library by word (ねこ, cat, fox): each hit is a character with its look and every pose it comes in. */
export function findPictures(words: string[]): Character[] {
  const terms = words.map(word => word.trim().toLowerCase()).filter(Boolean).slice(0, MAX_WORDS);
  const hit = new Set<string>();
  for (const material of MATERIALS) {
    const text = [material.slug, material.name, material.nameEn, material.characterId, material.pose, ...material.tags].join(' ').toLowerCase();
    if (terms.some(term => matches(term, text))) hit.add(material.characterId);
  }
  return [...hit].slice(0, MAX_CHARACTERS_FOUND).map(characterId => {
    const pictures = MATERIALS.filter(material => material.characterId === characterId);
    const base = pictures.find(material => material.slug === characterId) ?? pictures[0];
    return { character: characterId, name: base.name, category: base.category, look: base.prompt, pictures: pictures.map(material => ({ slug: material.slug, name: material.name, pose: material.pose })) };
  });
}

/** The character's original prompt, updated for the pose: the same art direction, the reference as identity, the new pose in place of the old. */
export function posePrompt(material: Material, pose: string): string {
  const base = materialOf(material.characterId) ?? material;
  return [
    STYLE_DIRECTION,
    `Reference is the character identity AND painting style anchor. Create one new pose of this same character: ${pose}.`,
    `The character was painted as: ${base.prompt}`,
    'Keep its colours, markings, proportions, small ink eyes and loose painted texture exactly as in the reference; change only the pose. One standalone full body centred with 12% clear margins, actual transparent background, no props, floor, shadow, text or frame.',
  ].join('\n');
}

/** Paints a pose with the image model and keeps it as the account's own illustration, so the book can place it as a `lib:` part anywhere the account's pictures go. */
export class LibraryPainter {
  constructor(private readonly db: Firestore, readonly images: ImageModel, private readonly assets: AssetService, private readonly reference: (masterRef: string) => Promise<Buffer>) {}

  async paint(agent: Agent, uid: string, material: Material, pose: string, title: string): Promise<{ partId: string; w: number; h: number }> {
    const reference = await this.reference(material.masterRef);
    const painting = await this.images.paint({ prompt: posePrompt(material, pose), reference, signal: agent.signal });
    agent.charge({ model: painting.model, usage: painting.usage });
    const stored = await this.assets.storeMaster(uid, painting.png);
    const doc = this.db.collection('illustrations').doc();
    await doc.set({
      ownerId: uid, title, masterRef: stored.ref, w: stored.w, h: stored.h, origin: 'ai', aiAssisted: true,
      library: { material: material.id, pose, model: painting.model }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), deleted: false,
    });
    return { partId: `lib:${doc.id}`, w: stored.w ?? 0, h: stored.h ?? 0 };
  }
}
