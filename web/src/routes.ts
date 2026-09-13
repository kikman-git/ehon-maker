export type Route =
  | { kind: 'shelf' }
  | { kind: 'composer'; id: string | null }
  | { kind: 'reader'; id: string }
  | { kind: 'guest'; token: string }
  | { kind: 'login'; id: string }
  | { kind: 'unknown' };

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const REQUEST = /^[A-Za-z0-9_-]{22}$/;

/** Clean paths, served by `_redirects` on Pages and by the dev middleware in vite.config.ts. */
export function currentRoute(pathname = location.pathname): Route {
  const parts = pathname.split('/').filter(Boolean);
  const [head, tail] = parts;
  if (parts.length === 0 || head === 'index.html') return { kind: 'shelf' };
  if (head === 'app' || head === 'app.html') return parts.length === 1 ? { kind: 'composer', id: null } : ID.test(tail) && parts.length === 2 ? { kind: 'composer', id: tail } : { kind: 'unknown' };
  if ((head === 'read' || head === 'read.html') && parts.length === 2 && ID.test(tail)) return { kind: 'reader', id: tail };
  if (head === 'g' && parts.length === 2 && TOKEN.test(tail)) return { kind: 'guest', token: tail };
  if (head === 'login' && parts.length === 2 && REQUEST.test(tail)) return { kind: 'login', id: tail };
  return { kind: 'unknown' };
}

export const paths = {
  shelf: '/',
  composer: (id?: string | null) => (id ? `/app/${id}` : '/app'),
  reader: (id: string) => `/read/${id}`,
  guest: (token: string) => `/g/${token}`,
  /** What the QR code encodes: a phone camera lands on the shelf page's hand-off notice. */
  login: (id: string) => `/login/${id}`,
};
