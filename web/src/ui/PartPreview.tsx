import { useEffect, useRef } from 'react';
import type { WebEditor } from '../core';

/** Built-in materials are painted from the same scene as their full-size page artwork. */
export function PartPreview({ editor, partId }: { editor: WebEditor; partId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = 96 * ratio;
    const context = canvas.getContext('2d')!;
    context.scale(ratio, ratio);
    editor.renderPart(context, 96, 96, partId);
    return () => { canvas.width = canvas.height = 0; };
  }, [editor, partId]);
  return <canvas ref={ref} className="part-preview" aria-hidden="true" />;
}
