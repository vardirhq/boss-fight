import assert from 'node:assert/strict';
import test from 'node:test';
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
    copy.transferAll, copy.householdFallback, copy.fighterFallback,
    copy.persistenceFallback, copy.persistenceRestoreFailed, copy.persistenceWriteFailed,
    copy.downloadBackup, copy.retrySave,
  ].join(' ');
  assert.doesNotMatch(generated, /[æøåÆØÅ]|\b(felles|gjøremål|løste|familien|mynter|ridder|kriger)\b/i);
});
