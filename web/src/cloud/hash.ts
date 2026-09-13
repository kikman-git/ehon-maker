const encoder = new TextEncoder();

/** Hex SHA-256; the page manifest and content-addressed asset keys both use it. */
export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }
    signal.addEventListener('abort', done, { once: true });
  });
}
