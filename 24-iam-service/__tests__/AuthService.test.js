'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AuthService, REFRESH_PREFIX } = require('../application/AuthService');

describe('AuthService.refreshToken', () => {
  let keyPath;
  let redis;

  beforeEach(() => {
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    keyPath = path.join(os.tmpdir(), `safar-test-${process.pid}-${Date.now()}.pem`);
    fs.writeFileSync(keyPath, pair.privateKey, { mode: 0o600 });
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn(),
    };
  });

  afterEach(() => {
    if (keyPath && fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
  });

  test('uses one atomic Redis operation to consume a refresh token', async () => {
    redis.eval
      .mockResolvedValueOnce(JSON.stringify({ userId: 'user-1', role: 'passenger' }))
      .mockResolvedValueOnce(null);
    const service = new AuthService({ privateKeyPath: keyPath, redis });

    const first = await service.refreshToken('old-token');
    expect(first.userId).toBe('user-1');
    expect(first.accessToken).toBeTruthy();
    expect(first.refreshToken).toBeTruthy();
    expect(redis.eval).toHaveBeenCalledWith(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      `${REFRESH_PREFIX}old-token`,
    );

    await expect(service.refreshToken('old-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
      statusCode: 401,
    });
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });

  test('does not issue tokens when refresh-token persistence is unavailable', async () => {
    const service = new AuthService({ privateKeyPath: keyPath, redis: null });
    await expect(service.login('user-1', 'passenger')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_STORAGE_UNAVAILABLE',
      statusCode: 503,
    });
  });

  test('fails closed if atomic Redis operations are unavailable', async () => {
    const service = new AuthService({ privateKeyPath: keyPath, redis: { get: jest.fn(), del: jest.fn() } });
    await expect(service.refreshToken('old-token')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_STORAGE_UNAVAILABLE',
      statusCode: 503,
    });
  });
});
