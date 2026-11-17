import {test} from 'node:test';
import assert from 'node:assert/strict';
// The selector is also used directly by Node in CI.
// @ts-expect-error JavaScript CI entry point has no generated declarations.
import {ALL, select} from '../scripts/select-integration.mjs';
test('unknown dependencies, migrations and CI changes never skip integration coverage', () => {
  for (const path of ['worker/library.ts', 'shared/game-copy.ts', 'shared/editorial.ts', 'worker/unknown-catalogue.ts', 'migrations/0055_test.sql', '.github/workflows/checks.yml', 'tests/fake_openai.py'])
    assert.deepEqual(select([path]), ALL);
  assert.deepEqual(select(['src/play.ts'], true), ALL);
});
test('selection preserves suite order and unions affected areas without duplicates', () => {
  assert.deepEqual(select(['src/play.ts']), ['game_browser']);
  assert.deepEqual(select(['src/play.ts', 'tests/slop.integration.py', 'src/slop-studio.ts']),
    ['slop', 'library_browser', 'slop_browser', 'game_browser', 'slop_auto_browser']);
  assert.deepEqual(select(['docs/generazione-slop.md']), []);
  assert.deepEqual(select(['tests/new_area.integration.py']), ALL);
});
