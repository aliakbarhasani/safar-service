'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateKeyPair({
  keysDir = path.resolve(__dirname),
  passphrase = (process.env.JWT_PRIVATE_KEY_PASSPHRASE || '').trim(),
  forceRegenerate = process.env.FORCE_KEY_REGEN === 'true',
} = {}) {
  const privateKeyPath = path.join(keysDir, 'jwt_private.pem');
  const publicKeyPath = path.join(keysDir, 'jwt_public.pem');
  const hasPrivateKey = fs.existsSync(privateKeyPath);
  const hasPublicKey = fs.existsSync(publicKeyPath);

  // Never rotate the signing identity implicitly: doing so can invalidate active
  // JWTs and cause issuer/verifier key mismatches during a routine setup run.
  if ((hasPrivateKey || hasPublicKey) && !forceRegenerate) {
    if (hasPrivateKey && hasPublicKey) {
      assertMatchingKeyPair(privateKeyPath, publicKeyPath, passphrase);
      return { generated: false, reason: 'keys-already-exist', privateKeyPath, publicKeyPath };
    }
    const error = new Error(
      'An incomplete JWT key pair exists. Restore the matching pair or set FORCE_KEY_REGEN=true after taking a backup.',
    );
    error.code = 'JWT_KEY_PAIR_INCOMPLETE';
    throw error;
  }

  fs.mkdirSync(keysDir, { recursive: true });
  const privateKeyEncoding = { type: 'pkcs8', format: 'pem' };
  if (passphrase) {
    privateKeyEncoding.cipher = 'aes-256-cbc';
    privateKeyEncoding.passphrase = passphrase;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding,
  });

  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
  return { generated: true, privateKeyPath, publicKeyPath, encrypted: Boolean(passphrase) };
}

function assertMatchingKeyPair(privateKeyPath, publicKeyPath, passphrase) {
  try {
    const privateKey = crypto.createPrivateKey({
      key: fs.readFileSync(privateKeyPath, 'utf8'),
      format: 'pem',
      ...(passphrase ? { passphrase } : {}),
    });
    const actualPublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
    const storedPublicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath, 'utf8'))
      .export({ type: 'spki', format: 'pem' }).toString();
    if (actualPublicKey !== storedPublicKey) throw new Error('key mismatch');
  } catch (_) {
    const error = new Error(
      'The existing JWT key pair is invalid or does not match. Restore a matching backup or explicitly rotate with FORCE_KEY_REGEN=true.',
    );
    error.code = 'JWT_KEY_PAIR_MISMATCH';
    throw error;
  }
}

if (require.main === module) {
  try {
    const result = generateKeyPair();
    if (!result.generated) {
      console.log('JWT key pair already exists; preserving the current signing identity.');
    } else {
      console.log('RSA key pair generated (RS256, 2048-bit):');
      console.log('   Private:', result.privateKeyPath, result.encrypted ? '(encrypted)' : '(unencrypted)');
      console.log('   Public :', result.publicKeyPath);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { generateKeyPair };
