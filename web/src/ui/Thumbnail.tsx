import { useEffect, useRef } from 'react';
import { assets } from '../cloud/assetLoader';
import { type LibraryState, type PartLibrary } from '../cloud/library';
import { createStore, useStore } from '../cloud/store';
import { bookGlyphs, createReader, fonts } from '../core';
import { repaint } from './repaint';

const noLibrary = createStore<LibraryState>({ owner: null, parts: [] });

/** A static page rendered once per change; the backing store is released on unmount. */
export function Thumbnail({ json, library, pageIndex = 0, className }: { json: string; library: PartLibrary | null; pageIndex?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tick = useStore(repaint).n;
  const parts = useStore(library?.state ?? noLibrary).parts;
  const epoch = useStore(fonts).epoch;

  useEffect(() => { void bookGlyphs(json); }, [json]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let reader;
    try { reader = createReader(json); } catch { return; }
    library?.apply(reader);
    reader.setImageProvider((ref) => assets.image(ref));
    const paint = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, width / reader.pageAspect);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d')!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      reader.render(context, width, height, Math.min(pageIndex, reader.pageCount - 1));
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      reader.dispose();
      canvas.width = canvas.height = 0;
    };
  }, [json, library, parts, pageIndex, tick, epoch]);

  return <canvas ref={canvasRef} className={className ?? 'thumbnail'} aria-hidden="true" />;
}
