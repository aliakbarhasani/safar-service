/**
 * context-propagation.test.js - Validates AsyncLocalStorage correlation ID propagation
 *
 * Tests that:
 * 1. correlationId is accessible inside nested async functions
 * 2. Different async contexts have independent correlationIds
 * 3. The logger correctly reads the correlationId from context
 */

const { requestContext } = require('../../00-infrastructure/logger/context');

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    return fn()
      .then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`  ✗ ${name}: ${err.message}`);
        failed++;
      });
  }

  // Test 1: Basic context propagation
  await runTest('correlationId is accessible inside nested async function', async () => {
    const id = 'test-correlation-1';
    await requestContext.run({ correlationId: id }, async () => {
      const store = requestContext.getStore();
      assert(store !== undefined, 'store should exist');
      assert(store.correlationId === id, `expected ${id}, got ${store.correlationId}`);

      // Nested async operation
      await new Promise((resolve) => setTimeout(resolve, 10));
      const store2 = requestContext.getStore();
      assert(store2.correlationId === id, `nested: expected ${id}, got ${store2?.correlationId}`);
    });
  });

  // Test 2: Independent contexts
  await runTest('different async contexts have independent correlationIds', async () => {
    const results = {};

    const taskA = requestContext.run({ correlationId: 'ctx-A' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      results.a = requestContext.getStore()?.correlationId;
    });

    const taskB = requestContext.run({ correlationId: 'ctx-B' }, async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.b = requestContext.getStore()?.correlationId;
    });

    await Promise.all([taskA, taskB]);
    assert(results.a === 'ctx-A', `expected ctx-A, got ${results.a}`);
    assert(results.b === 'ctx-B', `expected ctx-B, got ${results.b}`);
  });

  // Test 3: Outside context returns undefined
  await runTest('outside context getStore returns undefined', async () => {
    const store = requestContext.getStore();
    assert(store === undefined, 'store should be undefined outside context');
  });

  // Test 4: Logger reads correlationId correctly
  await runTest('logger reads correlationId from context', async () => {
    const logger = require('../../00-infrastructure/logger/logger');
    const id = 'logger-test-id';

    // Capture console.log output
    const origLog = console.log;
    let logOutput = '';
    console.log = (msg) => { logOutput = msg; };

    await requestContext.run({ correlationId: id }, () => {
      logger.info('test message');
    });

    console.log = origLog;

    assert(logOutput.includes(id), `log should contain correlationId ${id}`);
    const parsed = JSON.parse(logOutput);
    assert(parsed.correlationId === id, `parsed correlationId should be ${id}`);
    assert(parsed.message === 'test message', 'message should match');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
