import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DAY_LONG, DAY_SHORT, STRINGS } from './i18n.ts';

test('both languages expose the same translation keys and complete weekdays', () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.no).sort());
  assert.equal(DAY_LONG.en.length, 7);
  assert.equal(DAY_SHORT.en.length, 7);
  assert.deepEqual(DAY_SHORT.en, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
});

test('English product-generated labels contain no Norwegian fallback text', () => {
  const copy = STRINGS.en;
  const generated = [
    ...copy.levelTitles, copy.newBoss, copy.newChore, copy.sharedWho,
    copy.redeemedFlash, copy.sharedRewardFlash, copy.transferFlash,
    copy.voucherUsed, copy.voucherUsedFlash,
    copy.transferAll, copy.householdFallback, copy.fighterFallback,
    copy.persistenceFallback, copy.persistenceRestoreFailed, copy.persistenceWriteFailed,
    copy.downloadBackup, copy.retrySave,
  ].join(' ');
  assert.doesNotMatch(generated, /[æøåÆØÅ]|\b(felles|gjøremål|løste|familien|mynter|ridder|kriger)\b/i);
});

test('transient toasts are raised from the catalogue, never from a literal', () => {
  // `flash(...)` writes straight to the toast, so a string literal there ships
  // untranslated. Every call must route through the active language's strings.
  const source = readFileSync(new URL('../store/GameContext.tsx', import.meta.url), 'utf8');
  const literals = [...source.matchAll(/\bflash\(\s*(['"`])/g)];
  assert.deepEqual(literals.map((match) => match[0]), [], 'flash() must be called with a translated string');
});
