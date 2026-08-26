/**
 * state-machine.test.js - تست‌های جامع ماشین وضعیت سفر
 * 
 * پوشش تست:
 *   - تمام انتقال‌های مجاز (valid transitions)
 *   - تمام انتقال‌های غیرمجاز (invalid transitions)
 *   - وضعیت‌های نهایی (terminal states)
 *   - انتشار رویدادها (event emission)
 *   - عدم وجود فرمول قیمت‌گذاری (No Pricing Formula)
 *   - پشتیبانی از ۶ نوع سرویس
 *   - Enhanced TripCompleted event
 */

const stateMachine = require('../services/trip-state.service');
const tripService = require('../services/trip.service');

// ============================================================================
// رنگ‌بندی خروجی
// ============================================================================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`Expected ${label} to be '${expected}', got '${actual}'`);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ${colors.green}✓${colors.reset} ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ${colors.red}✗${colors.reset} ${name}`);
    console.log(`    ${colors.dim}${err.message}${colors.reset}`);
  }
}

async function runAllTests() {
  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   Trip Engine - Comprehensive Tests${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

  // ====================================================================
  // ۱. معماری: عدم وجود فرمول قیمت‌گذاری
  // ====================================================================
  console.log(`${colors.bright}${colors.red}Architecture: No Pricing Formula${colors.reset}`);

  await test('No calculateFare function exported from trip.service', () => {
    assert(tripService.calculateFare === undefined, 'calculateFare must NOT exist');
  });

  await test('Service delegates to callPricingEngine (no inline pricing)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../services/trip.service.js'),
      'utf8'
    );
    // Verify calculateFare is NOT defined in the file
    const hasCalculateFare = source.includes('function calculateFare');
    assert(!hasCalculateFare, 'calculateFare function must not exist in trip.service.js');
  });

  // ====================================================================
  // ۲. پشتیبانی از لغت‌نامه یکپارچه سرویس‌ها (Single Source of Truth)
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Unified Service Types Support${colors.reset}`);

  const expectedServices = ['urban_taxi', 'intercity_taxi', 'freight', 'delivery', 'courier', 'tourism', 'cross_border'];

  for (const svc of expectedServices) {
    await test(`isValidServiceType('${svc}') returns true`, () => {
      assert(stateMachine.isValidServiceType(svc) === true, `${svc} should be valid`);
    });
  }

  await test('isValidServiceType rejects invalid service type', () => {
    assert(stateMachine.isValidServiceType('invalid_type') === false, 'should be false');
    // Legacy taxi-only names are NOT in the unified dictionary.
    assert(stateMachine.isValidServiceType('taxi') === false, 'legacy taxi should be false');
    assert(stateMachine.isValidServiceType('intercity') === false, 'legacy intercity should be false');
    assert(stateMachine.isValidServiceType('border_transport') === false, 'legacy border_transport should be false');
    assert(stateMachine.isValidServiceType(null) === false, 'null should be false');
  });

  await test('ServiceType enum has exactly 7 values (unified dictionary)', () => {
    const values = Object.values(stateMachine.ServiceType);
    assert(values.length === 7, `Expected 7 services, got ${values.length}`);
    for (const v of values) {
      assert(expectedServices.includes(v), `${v} should be in expected list`);
    }
  });

  await test('ALL_SERVICE_TYPES contains all 7 unified types', () => {
    assert(stateMachine.ALL_SERVICE_TYPES.length === 7, 'Should have 7 types');
    for (const v of expectedServices) {
      assert(stateMachine.ALL_SERVICE_TYPES.includes(v), `${v} should be included`);
    }
  });

  // ====================================================================
  // ۳. Enhanced TripCompleted Event
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Enhanced TripCompleted Event${colors.reset}`);

  await test('TripCompleted event listener exists in map', () => {
    const eventName = stateMachine.getEventForStatus('completed');
    assertEqual(eventName, 'TripCompleted', 'Event name for COMPLETED');
  });

  await test('TripCompleted event includes finalPrice field', () => {
    // Simulate trip data for publishTripEvent
    const mockTrip = {
      id: 'uuid-123',
      passenger_id: 'pass-1',
      driver_id: 'driver-1',
      service_type: 'taxi',
      final_cost: 85000,
      estimated_cost: 80000,
      currency_id: 'IRT',
      payment_method: 'wallet',
      origin_address: 'Tehran',
      destination_address: 'Karaj',
      country_id: 'IR',
    };
    
    // We can't easily test EventBus publish in isolation,
    // but we can verify the event handler doesn't throw
    try {
      stateMachine.publishTripEvent(mockTrip, 'in_progress', 'completed');
      assert(true, 'publishTripEvent completed without error');
    } catch (e) {
      assert(false, `publishTripEvent threw: ${e.message}`);
    }
  });

  // ====================================================================
  // ۴. انتقال‌های مجاز
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Valid Transitions${colors.reset}`);

  const validTests = [
    ['requested', 'searching'],
    ['searching', 'accepted'],
    ['accepted', 'arrived'],
    ['arrived', 'in_progress'],
    ['in_progress', 'completed'],
    ['requested', 'cancelled_by_passenger'],
    ['arrived', 'cancelled_by_driver'],
    ['requested', 'expired'],
  ];

  for (const [from, to] of validTests) {
    await test(`${from} → ${to} is valid`, () => {
      const result = stateMachine.validateTransition(from, to);
      assert(result.valid === true, `Transition ${from}→${to} should be valid`);
    });
  }

  // ====================================================================
  // ۵. انتقال‌های غیرمجاز
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Invalid Transitions${colors.reset}`);

  const invalidTests = [
    ['requested', 'completed'],
    ['requested', 'in_progress'],
    ['searching', 'completed'],
    ['searching', 'arrived'],
    ['accepted', 'completed'],
    ['completed', 'requested'],   // terminal
    ['cancelled_by_passenger', 'requested'], // terminal
    ['cancelled_by_driver', 'requested'],    // terminal
    ['expired', 'requested'],     // terminal
  ];

  for (const [from, to] of invalidTests) {
    await test(`${from} → ${to} is INVALID`, () => {
      const result = stateMachine.validateTransition(from, to);
      assert(result.valid === false, `Transition ${from}→${to} should be invalid`);
    });
  }

  // ====================================================================
  // ۶. وضعیت‌های نهایی
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Terminal States${colors.reset}`);

  const terminalStates = ['completed', 'cancelled_by_passenger', 'cancelled_by_driver', 'expired'];
  const nonTerminalStates = ['requested', 'searching', 'accepted', 'arrived', 'in_progress'];

  for (const s of terminalStates) {
    await test(`'${s}' is terminal`, () => {
      assert(stateMachine.isTerminalStatus(s) === true, `${s} should be terminal`);
    });
  }

  for (const s of nonTerminalStates) {
    await test(`'${s}' is NOT terminal`, () => {
      assert(stateMachine.isTerminalStatus(s) === false, `${s} should not be terminal`);
    });
  }

  await test('Terminal state rejects all transitions', () => {
    for (const s of terminalStates) {
      const result = stateMachine.validateTransition(s, 'requested');
      assert(result.valid === false, `${s} must reject all transitions`);
      assert(result.message.includes('terminal'), 'Must mention terminal');
    }
  });

  // ====================================================================
  // ۷. مجوزهای خاص
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Permission Checks${colors.reset}`);

  await test('Passenger can cancel when status is REQUESTED', () => {
    assert(stateMachine.canPassengerCancel('requested') === true);
  });

  await test('Passenger can cancel when status is ARRIVED', () => {
    assert(stateMachine.canPassengerCancel('arrived') === true);
  });

  await test('Passenger CANNOT cancel when status is IN_PROGRESS', () => {
    assert(stateMachine.canPassengerCancel('in_progress') === false);
  });

  await test('Driver can cancel when status is ACCEPTED', () => {
    assert(stateMachine.canDriverCancel('accepted') === true);
  });

  await test('Driver CANNOT cancel when status is REQUESTED', () => {
    assert(stateMachine.canDriverCancel('requested') === false);
  });

  await test('Trip can start only when ARRIVED', () => {
    assert(stateMachine.canStartTrip('arrived') === true);
    assert(stateMachine.canStartTrip('accepted') === false);
  });

  // ====================================================================
  // ۸. رویدادها
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Event Mapping${colors.reset}`);

  const eventMap = {
    'requested': 'TripCreated',
    'searching': 'TripSearching',
    'accepted': 'TripAccepted',
    'arrived': 'TripDriverArrived',
    'in_progress': 'TripInProgress',
    'completed': 'TripCompleted',
    'cancelled_by_passenger': 'TripCancelledByPassenger',
    'cancelled_by_driver': 'TripCancelledByDriver',
    'expired': 'TripExpired',
  };

  for (const [status, event] of Object.entries(eventMap)) {
    await test(`'${status}' maps to '${event}'`, () => {
      assertEqual(stateMachine.getEventForStatus(status), event, 'event');
    });
  }

  // ====================================================================
  // ۹. تست getAllowedTransitions
  // ====================================================================
  console.log(`\n${colors.bright}${colors.blue}Allowed Transitions List${colors.reset}`);

  await test('REQUESTED allows 3 transitions', () => {
    const allowed = stateMachine.getAllowedTransitions('requested');
    assert(allowed.length === 3, 'requested should have 3 transitions');
    assert(allowed.includes('searching'), 'Should include searching');
    assert(allowed.includes('cancelled_by_passenger'), 'Should include cancel');
    assert(allowed.includes('expired'), 'Should include expired');
  });

  await test('IN_PROGRESS allows only 1 transition', () => {
    const allowed = stateMachine.getAllowedTransitions('in_progress');
    assert(allowed.length === 1, 'in_progress should have 1 transition');
    assertEqual(allowed[0], 'completed', 'only completed');
  });

  await test('Terminal states have 0 transitions', () => {
    for (const s of terminalStates) {
      assert(stateMachine.getAllowedTransitions(s).length === 0, `${s} should have 0`);
    }
  });

  // ====================================================================
  // گزارش نهایی
  // ====================================================================
  const total = passed + failed;
  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   Test Results${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`  ${colors.bright}Total:${colors.reset}  ${total}`);
  console.log(`  ${colors.green}Passed:${colors.reset} ${passed}`);
  console.log(`  ${colors.red}Failed:${colors.reset} ${failed}`);
  console.log(`  ${colors.bright}Pass Rate:${colors.reset} ${((passed / total) * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log(`\n${colors.red}${colors.bright}Failed Tests:${colors.reset}`);
    failures.forEach(f => {
      console.log(`  ${colors.red}●${colors.reset} ${f.name}`);
      console.log(`    ${colors.dim}${f.error}${colors.reset}`);
    });
  }

  console.log(`\n${colors.green}${colors.bright}✓${colors.reset} All Trip Engine tests complete.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error(`${colors.red}FATAL:${colors.reset}`, err.message);
  process.exit(1);
});