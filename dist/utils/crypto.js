"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.sha256 = sha256;
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
exports.verifyHmacSignature = verifyHmacSignature;
exports.redactSecrets = redactSecrets;
const node_crypto_1 = __importDefault(require("node:crypto"));
function hashPassword(password, existingSalt) {
    const salt = existingSalt || node_crypto_1.default.randomBytes(16).toString('hex');
    const derived = node_crypto_1.default.scryptSync(password, salt, 64).toString('hex');
    return { hash: derived, salt };
}
function verifyPassword(password, hash, salt) {
    const { hash: candidate } = hashPassword(password, salt);
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && node_crypto_1.default.timingSafeEqual(a, b);
}
function sha256(value) {
    return node_crypto_1.default.createHash('sha256').update(value).digest('hex');
}
function encryptSecret(plaintext, rawKey = process.env.CREDENTIAL_ENCRYPTION_KEY) {
    if (!plaintext)
        throw new Error('Secret không được rỗng.');
    const keySrc = (rawKey || 'dev-fallback-key-change-in-production-32bytes').trim();
    const key = /^[0-9a-fA-F]{64}$/.test(keySrc)
        ? Buffer.from(keySrc, 'hex')
        : node_crypto_1.default.scryptSync(keySrc, 'craftopia-v2-salt', 32);
    const iv = node_crypto_1.default.randomBytes(12);
    const cipher = node_crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}
function decryptSecret(envelope, rawKey = process.env.CREDENTIAL_ENCRYPTION_KEY) {
    const parts = envelope.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1')
        throw new Error('Envelope không hợp lệ.');
    const keySrc = (rawKey || 'dev-fallback-key-change-in-production-32bytes').trim();
    const key = /^[0-9a-fA-F]{64}$/.test(keySrc)
        ? Buffer.from(keySrc, 'hex')
        : node_crypto_1.default.scryptSync(keySrc, 'craftopia-v2-salt', 32);
    const decipher = node_crypto_1.default.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
}
function verifyHmacSignature(payload, signatureHex, secret) {
    const expected = node_crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHex.trim(), 'hex');
    return a.length === b.length && node_crypto_1.default.timingSafeEqual(a, b);
}
function redactSecrets(text) {
    return text
        .replace(/(\/(?:register|reg|login|l|changepassword|cp)\s+)([^\r\n]+)/gi, '$1[REDACTED]')
        .replace(/(password|token|secret|apikey)\s*[:=]\s*[^\s"']+/gi, '$1=[REDACTED]');
}
