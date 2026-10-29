import { useEffect, useRef, useState } from 'react';
import { materialUrl } from '../materials';
import { assetBytes } from '../cloud/assetBytes';

export function MaterialImage({ masterRef, epoch }: { masterRef: string; epoch: number }) {
  const element = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setSrc(undefined);
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void assetBytes(materialUrl(masterRef), `${masterRef}/256.webp`).then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      }).catch(() => undefined);
    }, { rootMargin: '300px' });
    if (element.current) observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [masterRef, epoch]);
  return <img ref={element} className="material-image" src={src} alt="" decoding="async" draggable={false} />;
}
