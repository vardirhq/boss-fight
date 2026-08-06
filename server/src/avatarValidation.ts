import { createHash } from 'node:crypto';

const maximumAvatarBytes = 512 * 1024;
const supportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function hasMatchingSignature(mime: string, bytes: Buffer) {
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export function validatedAvatar(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Avatar must be an object');
  const avatar = value as Record<string, unknown>;
  if (typeof avatar.mime !== 'string' || !supportedMimeTypes.has(avatar.mime)) {
    throw new Error('Avatar MIME type must be image/png, image/jpeg, or image/webp');
  }
  if (typeof avatar.bytesBase64 !== 'string' || avatar.bytesBase64.length === 0 || !base64Pattern.test(avatar.bytesBase64)) {
    throw new Error('Avatar bytes must be canonical base64');
  }
  if (avatar.bytesBase64.length > Math.ceil(maximumAvatarBytes / 3) * 4) {
    throw new Error('Avatar exceeds the 512 KiB limit');
  }
  const bytes = Buffer.from(avatar.bytesBase64, 'base64');
  if (bytes.length === 0 || bytes.length > maximumAvatarBytes) throw new Error('Avatar exceeds the 512 KiB limit');
  if (bytes.toString('base64') !== avatar.bytesBase64) throw new Error('Avatar bytes must be canonical base64');
  if (!hasMatchingSignature(avatar.mime, bytes)) throw new Error('Avatar bytes do not match the declared MIME type');
  if (typeof avatar.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(avatar.hash)) throw new Error('Avatar hash must be SHA-256 hex');
  const hash = avatar.hash.toLowerCase();
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Avatar hash does not match bytes');
  return { mime: avatar.mime, bytes, hash };
}
