import { cloud } from './cloud/config';
import { createStore } from './cloud/store';
import { codec } from './core';

/** One story on the shelf, as the published index describes it (decision #60). */
export type TemplateSummary = {
  id: string; order: number; title: string; description: string; shape: string; pageCount: number;
  format: number; bytes: number; sha256: string; url: string;
};
type IndexEntry = Omit<TemplateSummary, 'description'> & { description: { ja: string; en: string } };

export type TemplateCatalog = { status: 'idle' | 'loading' | 'ready' | 'error'; items: TemplateSummary[] };
export const templateStore = createStore<TemplateCatalog>({ status: 'idle', items: [] });

/** Published templates live on the assets Worker; a checkout without cloud reads the dev server's local copy. */
const base = (cloud?.templatesUrl ?? `${import.meta.env.BASE_URL}templates`).replace(/\/$/, '');

let indexRequest: Promise<TemplateSummary[]> | null = null;

/** Fetches the index once per page load (again on `force`); the store follows along for the UI. */
export function loadTemplates(force = false): Promise<TemplateSummary[]> {
  if (indexRequest && !force) return indexRequest;
  templateStore.update({ status: 'loading' });
  const request = fetch(`${base}/index.json`, { cache: 'no-cache' }).then(async (response) => {
    if (!response.ok) throw new Error(`templates ${response.status}`);
    const index = await response.json() as { version: number; templates: IndexEntry[] };
    // A newer document format than this build reads is left out rather than shown and refused.
    const items = index.templates
      .filter((entry) => entry.format <= codec.formatVersion())
      .map((entry) => ({ ...entry, description: entry.description.ja }))
      .sort((a, b) => a.order - b.order);
    templateStore.update({ status: 'ready', items });
    return items;
  }).catch((error: unknown) => {
    templateStore.update({ status: 'error' });
    if (indexRequest === request) indexRequest = null;
    throw error;
  });
  indexRequest = request;
  return request;
}

const documents = new Map<string, Promise<string>>();

/** The published document of one story, fetched once per page load. */
export function templateDocument(id: string): Promise<string> {
  let request = documents.get(id);
  if (!request) {
    request = loadTemplates().then(async (items) => {
      const entry = items.find((item) => item.id === id);
      if (!entry) throw new Error('Unknown template.');
      const response = await fetch(`${base}/${entry.url}`);
      if (!response.ok) throw new Error(`template ${response.status}`);
      return response.text();
    }).catch((error: unknown) => { documents.delete(id); throw error; });
    documents.set(id, request);
  }
  return request;
}

/** A shelf copy of a story: its own id and timestamp, everything else as published. */
export async function templateBook(id: string, bookId = `b-${crypto.randomUUID()}`): Promise<string> {
  return codec.instantiateDocument(await templateDocument(id), bookId, Date.now());
}
