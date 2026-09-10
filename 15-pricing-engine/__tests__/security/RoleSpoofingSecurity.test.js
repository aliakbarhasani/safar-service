/**
 * Security Tests - Role Spoofing Prevention (PricingController)
 */
const PricingController = require('../../presentation/PricingController');
const controller = new PricingController();

console.log('\n=== ROLE SPOOFING SECURITY TESTS ===\n');
let pass = 0, fail = 0;
function check(cond, msg) { if (cond) { console.log('  [PASS] ' + msg); pass++; } else { console.log('  [FAIL] ' + msg); fail++; } }

// Test 1: req.user.role=provider is respected
{
  const req = { user: { role: 'provider' }, headers: { 'x-caller-role': 'customer' }, query: { role: 'customer' }, body: { role: 'customer' } };
  const role = controller._callerRole(req);
  check(role === 'provider', 'req.user.role=provider is respected (ignores header spoofing)');
}

// Test 2: req.user.role=customer is respected
{
  const req = { user: { role: 'customer' }, headers: { 'x-caller-role': 'provider' }, query: { role: 'provider' }, body: { role: 'provider' } };
  const role = controller._callerRole(req);
  check(role === 'customer', 'req.user.role=customer is respected (ignores header spoofing)');
}

// Test 3: Header X-Caller-Role is IGNORED
{
  const req = { headers: { 'x-caller-role': 'provider' }, query: {}, body: {} };
  const role = controller._callerRole(req);
  check(role === 'customer', 'X-Caller-Role header is IGNORED');
}

// Test 4: Query role is IGNORED
{
  const req = { headers: {}, query: { role: 'provider' }, body: {} };
  const role = controller._callerRole(req);
  check(role === 'customer', 'Query role is IGNORED');
}

// Test 5: Body role is IGNORED
{
  const req = { headers: {}, query: {}, body: { role: 'provider' } };
  const role = controller._callerRole(req);
  check(role === 'customer', 'Body role is IGNORED');
}

// Test 6: X-Role header is IGNORED
{
  const req = { headers: { 'x-role': 'provider' }, query: {}, body: {} };
  const role = controller._callerRole(req);
  check(role === 'customer', 'X-Role header is IGNORED');
}

// Test 7: No user defaults to customer
{
  const req = { headers: {}, query: {}, body: {} };
  const role = controller._callerRole(req);
  check(role === 'customer', 'No user defaults to customer');
}

// Test 8: Admin role maps to customer (data-hiding)
{
  const req = { user: { role: 'admin' }, headers: {}, query: {}, body: {} };
  const role = controller._callerRole(req);
  check(role === 'customer', 'Admin role maps to customer (data-hiding default)');
}

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail > 0 ? 1 : 0);
