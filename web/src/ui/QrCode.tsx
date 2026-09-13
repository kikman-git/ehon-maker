import { useEffect, useState } from 'react';

interface Modules { size: number; data: Uint8Array }

/** The encoder loads only when a code is shown; the modules become one crisp SVG path. */
export function QrCode({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const [modules, setModules] = useState<Modules | null>(null);
  useEffect(() => {
    let alive = true;
    setModules(null);
    import('qrcode').then(({ create }) => {
      if (!alive) return;
      const code = create(text, { errorCorrectionLevel: 'M' });
      setModules({ size: code.modules.size, data: code.modules.data as Uint8Array });
    }).catch(() => { /* the six-letter code beside it still works */ });
    return () => { alive = false; };
  }, [text]);
  if (!modules) return <div className="qr" style={{ width: size, height: size }} aria-hidden="true" />;
  let d = '';
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) if (modules.data[y * modules.size + x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return <svg className="qr" viewBox={`0 0 ${modules.size} ${modules.size}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={label}>
    <path d={d} fill="currentColor" />
  </svg>;
}
