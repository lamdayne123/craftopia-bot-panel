import crypto from 'node:crypto';

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: candidate } = hashPassword(password, salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function encryptSecret(plaintext: string, rawKey = process.env.CREDENTIAL_ENCRYPTION_KEY): string {
  if (!plaintext) throw new Error('Secret không được rỗng.');
  const keySrc = (rawKey || 'dev-fallback-key-change-in-production-32bytes').trim();
  const key = /^[0-9a-fA-F]{64}$/.test(keySrc)
    ? Buffer.from(keySrc, 'hex')
    : crypto.scryptSync(keySrc, 'craftopia-v2-salt', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(envelope: string, rawKey = process.env.CREDENTIAL_ENCRYPTION_KEY): string {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Envelope không hợp lệ.');
  const keySrc = (rawKey || 'dev-fallback-key-change-in-production-32bytes').trim();
  const key = /^[0-9a-fA-F]{64}$/.test(keySrc)
    ? Buffer.from(keySrc, 'hex')
    : crypto.scryptSync(keySrc, 'craftopia-v2-salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
}

export function verifyHmacSignature(payload: string, signatureHex: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex.trim(), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function redactSecrets(text: string): string {
  return text
    .replace(/(\/(?:register|reg|login|l|changepassword|cp)\s+)([^\r\n]+)/gi, '$1[REDACTED]')
    .replace(/(password|token|secret|apikey)\s*[:=]\s*[^\s"']+/gi, '$1=[REDACTED]');
}
