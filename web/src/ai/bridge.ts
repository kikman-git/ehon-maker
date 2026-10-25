import { cloudAtelierBridge } from '../atelier/cloudBridge';
import { cloud } from '../cloud/config';
import type { Store } from '../cloud/store';
import { cloudBookBridge } from './cloudBookBridge';
import type { AiEntry, AiState } from './state';

export type { AiEntry, AiState } from './state';

/** The atelier's facts in structured form for the callable. */
export interface AtelierSpec { title: string; mode: 'new' | 'revise'; selected: { id: string; name: string } | null; sketched: boolean }
/** The book desk's facts for the callable: the page in view, the mark in page percent and the items it names. */
export interface BookSpec { title: string; pageIndex: number; pageId: string; pageCount: number; mark: { pageIndex: number; pageId: string; x0: number; y0: number; x1: number; y1: number } | null; items: unknown[]; selected: unknown }
export interface AskInput { text: string; mark: string | null; image: string | null; spec?: AtelierSpec; book?: BookSpec }

/** A chat over one subject, the whole book or one picture, run by the metered harness (decision #67). */
export interface AiBridge {
  state: Store<AiState>;
  open(bookId: string, json: string): void;
  sync(bookId: string, json: string): void;
  ask(bookId: string, input: AskInput): void;
  stop(bookId: string): void;
  reset(bookId: string): void;
  /** A studio-side outcome shown in the chat, never sent to the model. */
  note(entry: AiEntry): void;
  /** `draft` marks the book as it stands mid-turn; the studio applies it the same way but says nothing until the turn ends. */
  onBook(listener: (bookId: string, json: string, draft?: boolean) => void): () => void;
}

/** The book desk: a chat over the whole open book. Present whenever there is a backend, which the emulators also are. */
export const aiBridge: AiBridge | null = cloud ? cloudBookBridge() : null;
/** The 素材アトリエ's own conversation, over one picture rather than the whole book. */
export const atelierBridge: AiBridge | null = cloud ? cloudAtelierBridge() : null;
