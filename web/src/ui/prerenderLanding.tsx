import { renderToStaticMarkup } from 'react-dom/server';
import { Landing } from './Landing';

/** Build-time only: crawlers and the first paint receive the real Japanese landing page. */
export function prerenderLanding(): string {
  return renderToStaticMarkup(<Landing intent="shelf" />);
}
