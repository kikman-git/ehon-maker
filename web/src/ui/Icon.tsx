import type { CSSProperties } from 'react';

const paths = {
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
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  chevron: 'm9 5 7 7-7 7',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  check: 'm5 12 4 4L19 6',
  panel: 'M3 4h18v16H3ZM9 4v16M5 8h2M5 11h2',
  pages: 'M3 6h18v12H3ZM8 6v12M16 6v12',
  print: 'M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6Z',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  compress: 'M10 4v6H4M14 20v-6h6M4 4l6 6M20 20l-6-6',
} as const;

export function Icon({ name, size = 20, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
