import { useEffect, useRef, useState } from 'react';
import { cssColor, ensureGlyphs, fontChoices, textColors, type WebEditor } from '../core';
import { Icon } from './Icon';

const textColorNames = ['黒', 'テラコッタ', 'セージ', '赤', '紫'];
const SIZE_STEP = 0.5;

/** Font, size, bold and colour for the selected text, or for the next text when none is selected. */
export function TextStyleControls({ editor, disabled, act }: { editor: WebEditor; disabled: boolean; act: (action: () => void) => void }) {
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const [fontsOpen, setFontsOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const current = fontChoices.find((face) => face.id === editor.fontId) ?? fontChoices[0];
  const size = editor.textSizePct;
  const setSize = (value: number) => act(() => editor.setTextSizePct(Math.round(value * 10) / 10));

  useEffect(() => { void ensureGlyphs(Object.fromEntries(fontChoices.map((face) => [face.id, face.name]))); }, []);
  useEffect(() => {
    if (!fontsOpen) return;
    const close = (event: Event) => { if (!picker.current?.contains(event.target as Node)) setFontsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFontsOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [fontsOpen]);

  return <div className="text-style">
    <div className="font-picker" ref={picker}>
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={fontsOpen} aria-label={'フォント: ' + current.name} style={{ fontFamily: `"Ehon-${current.id}", sans-serif` }} onClick={() => setFontsOpen(!fontsOpen)}>
        <span>{current.name}</span><Icon name="chevronDown" size={14} />
      </button>
      {fontsOpen && <div className="font-list" role="listbox" aria-label="フォント">{fontChoices.map((face) => <button type="button" key={face.id} role="option" aria-selected={face.id === current.id} style={{ fontFamily: `"Ehon-${face.id}", sans-serif` }} onClick={() => { act(() => editor.setFont(face.id)); setFontsOpen(false); }}>
        {face.name}{face.id === current.id && <Icon name="check" size={14} />}
      </button>)}</div>}
    </div>
    <div className="text-size" role="group" aria-label="文字の大きさ">
      <button type="button" disabled={disabled || size <= editor.minTextSizePct} aria-label="文字を小さく" onClick={() => setSize(size - SIZE_STEP)}><Icon name="minus" size={14} /></button>
      <input type="number" disabled={disabled} aria-label="文字の大きさ（数値）" inputMode="decimal" min={editor.minTextSizePct} max={editor.maxTextSizePct} step={SIZE_STEP}
        value={sizeDraft ?? String(Math.round(size * 10) / 10)}
        onChange={(event) => { setSizeDraft(event.target.value); const value = Number(event.target.value); if (event.target.value.trim() && Number.isFinite(value) && value > 0) setSize(value); }}
        onBlur={() => setSizeDraft(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }} />
      <button type="button" disabled={disabled || size >= editor.maxTextSizePct} aria-label="文字を大きく" onClick={() => setSize(size + SIZE_STEP)}><Icon name="plus" size={14} /></button>
    </div>
    <button type="button" className="bold-toggle" disabled={disabled} aria-pressed={editor.textBold} aria-label="太字" title="太字 (⌘B)" onClick={() => act(() => editor.setBold(!editor.textBold))}>B</button>
    <div className="text-colors" role="group" aria-label="文字の色">{textColors.map((color, index) => <button type="button" key={color} disabled={disabled} aria-label={textColorNames[index]} title={textColorNames[index]} aria-pressed={!editor.hasCustomTextColor && editor.textColorIndex === index} style={{ backgroundColor: cssColor(color) }} onClick={() => act(() => editor.setTextColour(index))} />)}
      <label className="text-color-custom" title="好きな色" data-active={editor.hasCustomTextColor || undefined}>
        <input type="color" disabled={disabled} aria-label="文字の好きな色" value={cssColor(editor.textColor)} onChange={(event) => act(() => editor.setCustomTextColour(0xff000000 | parseInt(event.target.value.slice(1), 16)))} />
      </label>
    </div>
  </div>;
}
