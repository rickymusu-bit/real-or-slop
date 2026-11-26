/** Regenerate the pipeline diagram, or verify that source and both published copies agree. */
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const source = new URL('../docs/assets/pipeline-slop.dot', import.meta.url);
const copies = ['../docs/assets/pipeline-slop.svg', '../public/docs/pipeline-slop.svg'].map(path => new URL(path, import.meta.url));
const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
const marker = `<!-- pipeline-source-sha256: ${hash} -->`;
if (process.argv.includes('--check')) {
  const [document, published] = copies.map(path => readFileSync(path, 'utf8'));
  if (document !== published || !document.includes(marker)) throw Error('Pipeline diagram is out of date. Review the flow and run npm run diagram:pipeline.');
  console.log('Pipeline diagram source and published copies agree.');
} else {
  const svg = execFileSync('dot', ['-Tsvg', source.pathname], { encoding: 'utf8' }).replace('<svg ', '<svg role="img" aria-label="How a SLOP photo is made" ');
  for (const copy of copies) writeFileSync(copy, svg.replace('</svg>', `${marker}\n</svg>`));
}
