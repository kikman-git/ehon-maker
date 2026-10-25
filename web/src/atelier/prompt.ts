export const CANDIDATES = 3;

export interface Part { id: string; name: string }

export interface AtelierPromptInput {
  title: string;
  request: string;
  mode: 'new' | 'revise';
  hasPiece: boolean;
  selected: Part | null;
  sketched: boolean;
  image: boolean;
  bookArt: number;
}

/** One turn for the atelier's CLI: what to write, what the picture shows, and the user's words verbatim. */
export function composeAtelierPrompt(input: AtelierPromptInput): string {
  const files = Array.from({ length: CANDIDATES }, (_, i) => `candidate-${i + 1}.svg`);
  const lines = [`You are drawing one illustration (素材) for the picture book "${input.title}" in the ぺたぺた 素材アトリエ. \`CLAUDE.md\` has the rules and \`FORMAT.md\` the SVG the app paints.`];
  if (input.mode === 'new') {
    lines.push(`Draw ${CANDIDATES} candidate illustrations for the request and write them to ${files.slice(0, -1).map((f) => `\`${f}\``).join(', ')} and \`${files.at(-1)}\`, each a clearly different take.`);
    if (input.hasPiece) lines.push('`piece.svg` is the illustration the user has now; the candidates are new takes on the request, not edits of it.');
  } else {
    lines.push('Change the current illustration, `piece.svg`, as the request asks and write it back to `piece.svg`. Change nothing else.');
  }
  if (input.image) lines.push(input.hasPiece ? '`view.png` shows the illustration as the user sees it.' : '`view.png` is blank paper with the user\'s sketch on it.');
  if (input.selected) lines.push(`The user selected the part \`<g id="${input.selected.id}">\`${input.selected.name !== input.selected.id ? ` (${input.selected.name})` : ''}, outlined in red in \`view.png\`. The request is about that part.`);
  if (input.sketched) lines.push('The user sketched in blue on `view.png`. Follow its shapes, pose and placement; it is a guide, not a line to trace.');
  if (input.bookArt) lines.push(`\`book-art/\` holds ${input.bookArt} picture${input.bookArt > 1 ? 's' : ''} already in this book; match their palette, line weight and shapes.`);
  lines.push('', 'Request:', input.request.trim(), '', 'Say nothing until the files are written; then reply in the language of the request with one short sentence.');
  return lines.join('\n');
}
