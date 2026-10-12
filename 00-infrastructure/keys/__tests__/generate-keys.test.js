'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateKeyPair } = require('../generate-keys');

describe('JWT key generation safety', () => {
  let keysDir;

  beforeEach(() => {
    keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safar-jwt-keys-'));
  });

  afterEach(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  test('generates a valid pair when no keys exist', () => {
    const result = generateKeyPair({ keysDir, passphrase: '' });
    expect(result.generated).toBe(true);

    const privateKey = fs.readFileSync(path.join(keysDir, 'jwt_private.pem'), 'utf8');
    const publicKey = fs.readFileSync(path.join(keysDir, 'jwt_public.pem'), 'utf8');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update('safar-service-key-check');
    signer.end();
    const signature = signer.sign(privateKey);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update('safar-service-key-check');
    verifier.end();
    expect(verifier.verify(publicKey, signature)).toBe(true);
  });

  test('preserves an existing pair unless explicit rotation is requested', () => {
    generateKeyPair({ keysDir, passphrase: '' });
    const privateBefore = fs.readFileSync(path.join(keysDir, 'jwt_private.pem'), 'utf8');
    const publicBefore = fs.readFileSync(path.join(keysDir, 'jwt_public.pem'), 'utf8');

    const result = generateKeyPair({ keysDir, passphrase: '' });
    expect(result).toMatchObject({ generated: false, reason: 'keys-already-exist' });
    expect(fs.readFileSync(path.join(keysDir, 'jwt_private.pem'), 'utf8')).toBe(privateBefore);
    expect(fs.readFileSync(path.join(keysDir, 'jwt_public.pem'), 'utf8')).toBe(publicBefore);
  });

  test('refuses to overwrite an incomplete pair without explicit rotation', () => {
    fs.writeFileSync(path.join(keysDir, 'jwt_private.pem'), 'existing-private-key');
    expect(() => generateKeyPair({ keysDir, passphrase: '' }))
      .toThrow(expect.objectContaining({ code: 'JWT_KEY_PAIR_INCOMPLETE' }));
  });

  test('regenerates only when explicitly requested', () => {
    generateKeyPair({ keysDir, passphrase: '' });
    const privateBefore = fs.readFileSync(path.join(keysDir, 'jwt_private.pem'), 'utf8');
    const result = generateKeyPair({ keysDir, passphrase: '', forceRegenerate: true });
    expect(result.generated).toBe(true);
    expect(fs.readFileSync(path.join(keysDir, 'jwt_private.pem'), 'utf8')).not.toBe(privateBefore);
  });
});
