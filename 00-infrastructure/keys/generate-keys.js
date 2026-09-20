const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.resolve(__dirname);
const privateKeyPath = path.join(keysDir, 'jwt_private.pem');
const publicKeyPath = path.join(keysDir, 'jwt_public.pem');

// رمز کلید خصوصی فقط از محیط تامین می‌شود؛ هیچ رمزی داخل مخزن نگه‌داری نمی‌شود.
// در صورت نبود JWT_PRIVATE_KEY_PASSPHRASE کلید بدون رمز (PKCS#8) تولید می‌شود
// تا سرویس‌هایی که passphrase را پشتیبانی نمی‌کنند (AuthService) درست کار کنند.
const passphrase = (process.env.JWT_PRIVATE_KEY_PASSPHRASE || '').trim();

// Generate RSA key pair
const privateKeyEncoding = {
  type: 'pkcs8',
  format: 'pem'
};

if (passphrase) {
  privateKeyEncoding.cipher = 'aes-256-cbc';
  privateKeyEncoding.passphrase = passphrase;
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding
});


// دسترسی محدود به کلید خصوصی روی فایل‌سیستم‌های پشتیبان.
fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

console.log('RSA key pair generated (RS256, 2048-bit):');
console.log('   Private:', privateKeyPath, passphrase ? '(encrypted)' : '(unencrypted)');
console.log('   Public :', publicKeyPath);
