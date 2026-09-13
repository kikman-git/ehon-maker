import type { CSSProperties } from 'react';

type Glyph = string | { d: string; fill?: boolean }[];

/** One 24-unit stroke set for every control, so a label and its meaning read the same everywhere. */
const glyphs = {
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  brush: 'm15 4 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16l-1 4Z',
  eraser: 'm15 4 6 6-10 10H7l-5-5L13 4a1.4 1.4 0 0 1 2 0ZM8 9l7 7M11 20h10',
  select: 'm5 3 14 10-7 1-3 7L5 3Z',
  text: 'M4 6V4h16v2M12 4v16M8 20h8',
  parts: 'M3 3h7v7H3ZM17 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM3 20l4-7 4 7H3ZM17 14v7M13.5 17.5h7',
  hand: 'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 4-3 6-7 6-3 0-4-1-6-4l-4-5a2 2 0 0 1 3-2l2 2Z',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  book: 'M12 5C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1Zm0 0v15',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  chevron: 'm9 5 7 7-7 7',
  chevronLeft: 'm15 5-7 7 7 7',
  chevronDown: 'm5 9 7 7 7-7',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  check: 'm5 12 4 4L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  panel: 'M3 4h18v16H3ZM9 4v16M5 8h2M5 11h2',
  pages: 'M3 6h18v12H3ZM8 6v12M16 6v12',
  page: 'M6 3h8l4 4v14H6ZM14 3v4h4',
  spread: 'M3 5h8v14H3ZM13 5h8v14h-8Z',
  print: 'M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6Z',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  compress: 'M10 4v6H4M14 20v-6h6M4 4l6 6M20 20l-6-6',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6',
  send: 'M21 3 3 10l8 3 3 8 7-18ZM11 13l10-10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5',
  copy: 'M9 9h11v11H9ZM5 15H4V4h11v1',
  stop: 'M6 6h12v12H6Z',
  play: 'M7 4l13 8-13 8V4Z',
  speaker: 'M4 9v6h4l5 4V5L8 9H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  image: 'M3 5h18v14H3ZM3 16l5-5 4 4 3-3 6 5M15.5 9.5h.1',
  folder: 'M3 6h6l2 2h10v11H3Z',
  folderOpen: 'M3 6h6l2 2h10v3M3 6v13h17l2-8H6l-3 8',
  save: 'M14 3H5v18h14V8l-5-5ZM14 3v5h5M12 11v7m-3-3 3 3 3-3',
  shelf: 'M4 3h4v18H4ZM10 3h4v18h-4ZM15.4 5l3.9-1 3.7 15.5-3.9 1Z',
  sparkles: 'm12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM5 16l.7 1.3L7 18l-1.3.7L5 20l-.7-1.3L3 18l1.3-.7L5 16Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  login: 'M14 4h5v16h-5M3 12h11m-4-4 4 4-4 4',
  logout: 'M10 4H5v16h5M14 8l4 4-4 4m4-4H9',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM11 18h2',
  qr: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM5.5 5.5h2v2h-2ZM16.5 5.5h2v2h-2ZM5.5 16.5h2v2h-2ZM14 14h3v3h-3ZM19 14h2v2h-2ZM14 19h2v2h-2ZM18 18h3v3h-3Z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z',
  flask: 'M9 3h6M10 3v6l-6 10a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 16h10',
  toFront: [{ d: 'M4 4h11v11H4Z' }, { d: 'M9 9h11v11H9Z', fill: true }],
  toBack: [{ d: 'M9 9h11v11H9Z' }, { d: 'M4 4h11v11H4Z', fill: true }],
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  const glyph: Glyph = glyphs[name];
  const paths = typeof glyph === 'string' ? [{ d: glyph, fill: false }] : glyph;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
    {paths.map((path) => <path key={path.d} d={path.d} fill={path.fill ? 'currentColor' : undefined} fillOpacity={path.fill ? 0.3 : undefined} />)}
  </svg>;
}
