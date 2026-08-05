import assert from 'node:assert/strict';
import test from 'node:test';
import { knownAvatarHashes, mergeAvatarCache } from './avatarCache';

test('avatar cache retains matching bytes, replaces changed hashes, and removes deleted avatars', () => {
  const current = [
    { fighter_id: 'a', hash: 'old-a', bytes_base64: 'a-bytes' },
    { fighter_id: 'b', hash: 'old-b', bytes_base64: 'b-bytes' },
  ];
  const fighters = [{ id: 'a', avatar_hash: 'old-a' }, { id: 'b', avatar_hash: 'new-b' }, { id: 'c', avatar_hash: null }];
  const incoming = [{ fighter_id: 'b', hash: 'new-b', bytes_base64: 'new-bytes' }];
  assert.deepEqual(mergeAvatarCache(fighters, current, incoming), [current[0], incoming[0]]);
  assert.deepEqual(knownAvatarHashes(current), { a: 'old-a', b: 'old-b' });
});
