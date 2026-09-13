// Checks a book document the way the app will read it: `pnpm ehon-check path/to/book.ehon.json`.
// Needs the staged core (`make web-core`). Exit 1 while the document has errors.
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('usage: pnpm ehon-check <file.ehon.json>');
  process.exit(2);
}
const { EhonCodec } = await import('../vendor/ehon-core/ehon-shared.mjs');
const codec = EhonCodec.getInstance();
const json = await readFile(file, 'utf8');
const report = JSON.parse(codec.checkDocument(json));
for (const error of report.errors) console.log(`✗ ${error}`);
for (const warning of report.warnings) console.log(`! ${warning}`);
if (report.ok) {
  const summary = JSON.parse(codec.summaryJson(json));
  const art = JSON.parse(codec.artJson(json));
  console.log(`✓ ${summary.title || file}: ${summary.pageCount} page(s), ${art.length} piece(s) of art${report.warnings.length ? `, ${report.warnings.length} warning(s)` : ''}`);
} else {
  console.log(`✗ ${file}: ${report.errors.length} error(s)`);
}
process.exit(report.ok ? 0 : 1);
