import { assets } from '../cloud/assetLoader';
import { createStore } from '../cloud/store';

/** Bumped when a bitmap or a part definition arrives, so static canvases repaint once. */
export const repaint = createStore({ n: 0 });
export const requestRepaint = () => repaint.update({ n: repaint.get().n + 1 });
assets.onChange = requestRepaint;
