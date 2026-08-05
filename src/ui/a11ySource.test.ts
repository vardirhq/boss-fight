import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('critical screens do not use non-keyboard elements as click targets', () => {
  const source = [
    read('../App.tsx'), read('../screens/BattleScreen.tsx'), read('../screens/HomeScreen.tsx'),
    read('../screens/overlays.tsx'), read('../screens/managers.tsx'),
  ].join('\n');
  assert.doesNotMatch(source, /<(?:div|span)\b[^>]*\bonClick=/);
});

test('account and manager inputs have programmatic names', () => {
  const source = [read('../online/AccountSettings.tsx'), read('../screens/managers.tsx')].join('\n');
  const inputs = source.match(/<input\b[^>]*>/g) ?? [];
  assert.ok(inputs.length > 0);
  for (const input of inputs) {
    assert.ok(input.includes('aria-label=') || input.includes('type="file"'), `Unnamed input: ${input}`);
  }
});

test('closable application overlays use the focus-managed dialog surface', () => {
  const app = read('../App.tsx');
  const managers = read('../screens/managers.tsx');
  const overlays = read('../screens/overlays.tsx');
  assert.match(app, /<DialogSurface label=\{accountCopy\.title\}/);
  assert.equal((managers.match(/<DialogSurface /g) ?? []).length, 3);
  assert.ok((overlays.match(/<DialogSurface /g) ?? []).length >= 2);
});
