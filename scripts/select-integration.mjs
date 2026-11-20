/** Conservative CI selection: unknown files and shared infrastructure always run the full suite. */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const ALL = ['library', 'analysis', 'slop', 'database', 'game', 'stats',
  'library_browser', 'real_wizard', 'slop_browser', 'database_browser', 'game_browser', 'slop_auto', 'slop_auto_browser'];
const BROWSER = ALL.filter(s => s.includes('browser') || s === 'real_wizard');
export function select(files, full = false) {
  if (full || !files.length) return ALL;
  const selected = new Set();
  for (const file of files) {
    if (/\.md$|^docs\//.test(file)) continue;
    let suites;
    if (/^tests\/([\w]+)\.integration\.py$/.test(file)) {
      const suite = /^tests\/([\w]+)\.integration\.py$/.exec(file)[1];
      if (!ALL.includes(suite)) return ALL;
      suites = [suite];
    } else if (/^tests\/.*\.test\.ts$/.test(file)) suites = [];
    else if (/^worker\/slop(?:-auto|-generation|-references|-runner)?\.ts$|^shared\/slop-(proposals|composition)\.ts$/.test(file))
      suites = ['slop', 'slop_auto', 'slop_browser', 'slop_auto_browser', 'library_browser'];
    else if (/^src\/slop[^/]*\.(ts|css)$/.test(file)) suites = ['slop_browser', 'slop_auto_browser', 'library_browser'];
    else if (/^worker\/stats\.ts$/.test(file)) suites = ['stats', 'library_browser'];
    else if (/^src\/(stats|database-chart)\.(ts|css)$/.test(file)) suites = ['library_browser', 'database_browser'];
    else if (/^src\/(play|preload|photo-viewer)\.(ts|css)$/.test(file)) suites = ['game_browser'];
    else if (/^src\/(library|database|admin-[\w-]+|model-context|caption-count)\.(ts|css)$/.test(file)) suites = BROWSER;
    else return ALL;
    for (const suite of suites) selected.add(suite);
  }
  return ALL.filter(s => selected.has(s));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let files = [], full = process.env.FULL_INTEGRATION === 'true' || !process.env.BASE_SHA;
  if (!full) {
    try { files = execFileSync('git', ['diff', '--no-renames', '--name-only', '--diff-filter=ACDMRT', process.env.BASE_SHA, process.env.HEAD_SHA || 'HEAD'], {encoding:'utf8'}).trim().split('\n').filter(Boolean); }
    catch { full = true; }
  }
  const suites = select(files, full);
  console.log('Integration suites:', suites.join(', ') || '(none: unit checks only)');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `suites=${suites.join(',')}\nrun=${suites.length > 0}\nbrowser=${suites.some(s => BROWSER.includes(s))}\n`);
}
