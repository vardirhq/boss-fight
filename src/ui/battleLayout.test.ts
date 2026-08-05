import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('battle layout uses stable section classes instead of child positions', () => {
  const screen = read('../screens/BattleScreen.tsx');
  const styles = read('../styles.css');
  for (const className of ['battle-layout', 'battle-stage', 'battle-party-rail', 'battle-attacks']) {
    assert.match(screen, new RegExp(`className="${className}"`));
    assert.match(styles, new RegExp(`\\.${className}\\s*\\{`));
  }
  assert.doesNotMatch(styles, /\.battle-scroll[^\n]*:nth-child/);
});
