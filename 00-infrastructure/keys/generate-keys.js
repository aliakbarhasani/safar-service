const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.resolve(__dirname);
const privateKeyPath = path.join(keysDir, 'jwt_private.pem');
const publicKeyPath = path.join(keysDir, 'jwt_public.pem');

// Generate RSA key pair
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
    passphrase: 'safar-jwt-rsa-2026'
  }
});

fs.writeFileSync(privateKeyPath, privateKey);
fs.writeFileSync(publicKeyPath, publicKey);

console.log('✅ RSA keys generated:');
console.log('   Private:', privateKeyPath);
console.log('   Public:', publicKeyPath);