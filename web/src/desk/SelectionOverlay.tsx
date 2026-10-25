import type { KeyboardEvent } from 'react';
import { ensureGlyphs, type WebEditor } from '../core';
import { Icon } from '../ui/Icon';
import { TextStyleControls } from '../ui/TextStyle';
import type { Frame } from './view';

const lineCount = (text: string) => Math.min(6, text.split('\n').length);

interface Props {
  editor: WebEditor;
  frame: Frame;
  readOnly: boolean;
  act: (action: () => void) => void;
  editingText: boolean;
  onEditText: (editing: boolean) => void;
}

/**
 * Chrome on the selected item, in page units under the desk transform; `--inv` keeps it screen-sized.
 * The rotate handle is driven by the desk's pointer engine through `data-rotate-handle`.
 */
export function SelectionOverlay({ editor, frame, readOnly, act, editingText, onEditText }: Props) {
  const bounds = editor.selectedBounds(frame.w, frame.h);
  if (!bounds || readOnly || editor.isEditingIllustration) return null;
  const [cx, cy, w, h, deg] = bounds;
  const halfW = w / 100 * frame.w / 2;
  const halfH = h / 100 * frame.h / 2;
  const radians = deg * Math.PI / 180;
  // The toolbar clears the rotated box, and drops below it when the text sits near the top of the page.
  const reach = Math.abs(halfW * Math.sin(radians)) + Math.abs(halfH * Math.cos(radians));
  const below = cy / 100 * frame.h - reach < frame.h * 0.2;
  const text = editor.selectedText;
  const setText = (value: string, ruby: boolean) => {
    void ensureGlyphs({ [editor.fontId]: value });
    act(() => ruby ? editor.setDraftRuby(value) : editor.setDraftText(value));
  };
  const finishOn = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) { event.preventDefault(); onEditText(false); }
  };

  return <div className="selection-overlay" style={{ left: frame.x + cx / 100 * frame.w, top: frame.y + cy / 100 * frame.h }}>
    <div className="rotate-arm" style={{ transform: `rotate(${deg}deg)`, ['--reach' as string]: `${halfH}px` }}>
      <span className="rotate-stem" />
      <button type="button" className="rotate-handle" data-rotate-handle="" aria-label="ドラッグして回転" title="ドラッグして回転 · Shift で 15° ずつ"><Icon name="rotate" size={13} /></button>
    </div>
    {text != null && <div className="text-toolbar" data-below={below || undefined} style={{ ['--reach' as string]: `${reach}px` }} role="toolbar" aria-label="文字の書式">
      <div className="text-toolbar-row">
        <TextStyleControls editor={editor} disabled={readOnly} act={act} />
        <button type="button" className="edit-words" aria-pressed={editingText} aria-label="文字を編集" title="文字を編集 (ダブルクリック)" onClick={() => onEditText(!editingText)}><Icon name="text" size={15} /></button>
      </div>
      {editingText && <div className="text-toolbar-row text-toolbar-fields">
        <textarea autoFocus aria-label="文字" title="Enter で改行 · ⌘Enter か Esc で完了" rows={lineCount(text)} value={text} onChange={(event) => setText(event.target.value, false)} onKeyDown={finishOn} />
        <textarea aria-label="ふりがな（よみ）" placeholder="ふりがな" title="行ごとに改行で区切る" rows={lineCount(text)} value={editor.selectedRuby ?? ''} onChange={(event) => setText(event.target.value, true)} onKeyDown={finishOn} />
      </div>}
    </div>}
  </div>;
}
