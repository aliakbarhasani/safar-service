'use strict';

/**
 * generate-keys.js - IAM Service (P11-1)
 *
 * تولید زوج کلید RSA-2048 برای امضای Access Token های RS256.
 * اجرا: node 24-iam-service/infrastructure/keys/generate-keys.js
 *
 * خروجی:
 *   - private.pem  (کلید خصوصی — فقط در سرویس IAM / صادرکننده‌ی توکن)
 *   - public.pem   (کلید عمومی — برای وریفای Stateless در Gateway)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname; // infrastructure/keys

function pem(key, type) {
  const der = key.export().toString('base64');
  const lines = der.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${type} KEY-----\n${lines}\n-----END ${type} KEY-----\n`;
}

function generate() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

  const privatePem = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const publicPem = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();

  fs.writeFileSync(path.join(OUT_DIR, 'private.pem'), privatePem, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'public.pem'), publicPem, 'utf8');

  console.log('RSA-2048 key pair generated:');
  console.log(`  private.pem -> ${path.join(OUT_DIR, 'private.pem')}`);
  console.log(`  public.pem  -> ${path.join(OUT_DIR, 'public.pem')}`);
  console.log('public pem (first lines):');
  console.log(publicPem.split('\n').slice(0, 3).join('\n'));
}

generate();
module.exports = { generate };