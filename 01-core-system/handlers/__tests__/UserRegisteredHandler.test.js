/**
 * UserRegisteredHandler.test.js
 *
 * تست‌های واحد برای هندلر رویداد `UserRegistered` که وظیفه ایجاد خودکار
 * پروفایل Seller/Advertiser در جدول‌های sellers/advertisers را دارد.
 */

const { UserRegisteredHandler } = require('../UserRegisteredHandler');

// EventBus ساختگی برای تست اشتراک بدون وابستگی به سینگلتون واقعی
function makeFakeBus() {
  const store = {};
  return {
    store,
    on(event, handler) {
      (store[event] = store[event] || []).push(handler);
    },
    listeners(event) {
      return store[event] || [];
    },
  };
}

function makeFakePool(querySpy) {
  return {
    query: (sql, params) => querySpy(sql, params),
  };
}

describe('UserRegisteredHandler', () => {
  test('seller payload creates a row in the "sellers" table with id = userId', async () => {
    const calls = [];
    const pool = makeFakePool((sql, params) => {
      calls.push({ sql, params });
      if (String(sql).trim() === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return {
        rows: [{
          id: params[0],
          user_id: params[1],
          store_name: params[2],
          status: 'active',
        }],
      };
    });

    const bus = makeFakeBus();
    const handler = new UserRegisteredHandler({ pool, eventBus: bus });
    const res = await handler.handle({
      event: 'UserRegistered',
      data: {
        userId: 'u-1', firstName: 'Ali', lastName: 'Rezaei',
        role: 'seller', phoneNumber: '+989120000001',
      },
    });

    expect(res.created).toBe(true);
    expect(res.role).toBe('seller');

    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO sellers'));
    expect(insertCall).toBeTruthy();
    // طراحی کلیدی: id کاربر = id پروفایل تا FK محصول برقرار باشد
    expect(insertCall.params[0]).toBe('u-1'); // id
    expect(insertCall.params[1]).toBe('u-1'); // user_id
    expect(insertCall.params[2]).toBe('Ali Rezaei Store'); // store_name
    expect(insertCall.sql).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  test('advertiser payload creates a row in the "advertisers" table', async () => {
    const calls = [];
    const pool = makeFakePool((sql, params) => {
      calls.push({ sql, params });
      if (String(sql).trim() === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return {
        rows: [{
          id: params[0], user_id: params[1], company_name: params[2], status: 'active',
        }],
      };
    });

    const handler = new UserRegisteredHandler({ pool, eventBus: makeFakeBus() });
    const res = await handler.handle({
      event: 'UserRegistered',
      data: {
        userId: 'u-2', firstName: 'Sara', lastName: 'Mohammadi',
        role: 'advertiser', phoneNumber: '+989120000002',
      },
    });

    expect(res.created).toBe(true);
    expect(res.role).toBe('advertiser');
    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO advertisers'));
    expect(insertCall).toBeTruthy();
    expect(insertCall.params[0]).toBe('u-2');
    expect(insertCall.sql).toContain('company_name');
  });

  test('non-business roles (e.g. passenger) do not trigger any database access', async () => {
    const calls = [];
    const pool = makeFakePool((sql) => {
      calls.push(String(sql).trim());
      return { rows: [{ '?column?': 1 }] };
    });

    const handler = new UserRegisteredHandler({ pool, eventBus: makeFakeBus() });
    const res = await handler.handle({
      event: 'UserRegistered',
      data: { userId: 'u-3', firstName: 'Z', role: 'passenger', phoneNumber: '+989120000003' },
    });

    expect(res.created).toBe(false);
    expect(res.reason).toBe('no_business_profile_needed');
    // حتی بررسی آمادگی دیتابیس هم نباید برای نقش غیرکسب‌وکار انجام شود
    expect(calls.length).toBe(0);
  });

  test('register() subscribes to the UserRegistered event (idempotent)', () => {
    const bus = makeFakeBus();
    const pool = makeFakePool(() => ({ rows: [] }));
    const handler = new UserRegisteredHandler({ pool, eventBus: bus });

    handler.register();
    handler.register(); // فراخوانی دوباره نباید اشتراک تکراری بسازد

    expect(bus.listeners('UserRegistered').length).toBe(1);
  });

  test('end-to-end: publish on real EventBus invokes the handler', async () => {
    // از EventBus سینگلتون واقعی استفاده می‌کنیم تا اتصال درون‌پروسسی رویداد را شبیه‌سازی کنیم
    const eventBus = require('../../../01-core-system/EventBus');
    const calls = [];
    const pool = makeFakePool((sql, params) => {
      calls.push({ sql, params });
      if (String(sql).trim() === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return { rows: [{ id: params[0], user_id: params[1], store_name: params[2], status: 'active' }] };
    });

    const handler = new UserRegisteredHandler({ pool, eventBus });
    handler.register();

    eventBus.publish('UserRegistered', {
      userId: 'u-9', firstName: 'Karim', lastName: 'Kazemi', role: 'advertiser',
    });

    // به پردازشگر async رویداد فرصت اجرا بدهیم
    await new Promise((r) => setTimeout(r, 20));

    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO advertisers'));
    expect(insertCall).toBeTruthy();
    expect(insertCall.params[1]).toBe('u-9');
  });
});