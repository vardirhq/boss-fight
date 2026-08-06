import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validatedAvatar } from './avatarValidation.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const valid = {
  mime: 'image/png', bytesBase64: png.toString('base64'),
  hash: createHash('sha256').update(png).digest('hex'),
};

test('supported avatars require canonical bytes, matching signatures, and matching hashes', () => {
  assert.deepEqual(validatedAvatar(valid), { mime: 'image/png', bytes: png, hash: valid.hash });
  assert.throws(() => validatedAvatar({ ...valid, mime: 'image/svg+xml' }), /MIME type/);
  assert.throws(() => validatedAvatar({ ...valid, bytesBase64: 'not base64' }), /canonical base64/);
  assert.throws(() => validatedAvatar({ ...valid, mime: 'image/jpeg' }), /declared MIME/);
  assert.throws(() => validatedAvatar({ ...valid, hash: '0'.repeat(64) }), /does not match bytes/);
});

test('avatar payloads are bounded before and after decoding', () => {
  const oversized = Buffer.alloc(512 * 1024 + 1).toString('base64');
  assert.throws(() => validatedAvatar({ ...valid, bytesBase64: oversized }), /512 KiB/);
});
