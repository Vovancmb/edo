import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const hashPassword   = (pw) => bcrypt.hashSync(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

export function encryptPrivateKey(privateKeyPem, nepPassword) {
  const salt = crypto.randomBytes(16);
  const key  = crypto.scryptSync(nepPassword, salt, 32);
  const iv   = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { salt: salt.toString('base64'), payload: Buffer.concat([iv, tag, enc]).toString('base64') };
}

export function decryptPrivateKey(payloadB64, saltB64, nepPassword) {
  const salt = Buffer.from(saltB64, 'base64');
  const key  = crypto.scryptSync(nepPassword, salt, 32);
  const buf  = Buffer.from(payloadB64, 'base64');
  const iv   = buf.subarray(0, 12);
  const tag  = buf.subarray(12, 28);
  const enc  = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function signData(privateKeyPem, data) {
  const s = crypto.createSign('RSA-SHA256');
  s.update(data); s.end();
  return s.sign(privateKeyPem, 'base64');
}
