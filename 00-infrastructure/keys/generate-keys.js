const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.resolve(__dirname);
const privateKeyPath = path.join(keysDir, 'jwt_private.pem');
const publicKeyPath = path.join(keysDir, 'jwt_public.pem');
const passphrase = process.env.JWT_PRIVATE_KEY_PASSPHRASE;

if (!passphrase || !passphrase.trim()) {
  throw new Error('JWT_PRIVATE_KEY_PASSPHRASE is required and must be supplied outside the repository.');
}

// Generate RSA key pair.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase
  }
});

// Keep the private key restricted on supported filesystems.
fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

console.log('RSA keys generated:');
console.log('   Private:', privateKeyPath);
console.log('   Public:', publicKeyPath);