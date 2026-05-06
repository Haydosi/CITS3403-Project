// Unit tests for the pure financial math in calculator_math.js
// Run with: node tests/test_calculator.js   (no extra packages required)

'use strict';

const assert = require('assert');
const path   = require('path');
const { mcPMT, mcPV, mcNPER, ccPMT, ccNPER, simulateMinRepayments } =
    require(path.join(__dirname, '..', 'app', 'static', 'js', 'calculator_math.js'));

// ── Helper ────────────────────────────────────────────────────────────────────
// Returns true when |actual - expected| ≤ tol.
// Financial results only need to be accurate to a few cents, so tol = 0.01 by default.
function near(actual, expected, tol = 0.01) {
    return Math.abs(actual - expected) <= tol;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓  ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ✗  ${name}`);
        console.error(`     ${e.message}`);
        failed++;
    }
}

// ── ccPMT ─────────────────────────────────────────────────────────────────────
// ccPMT(monthlyRate, numMonths, principal) → fixed monthly payment
console.log('\nccPMT');

test('$3,000 at 18% p.a. over 24 months ≈ $149.77', () => {
    // monthlyRate = 18% / 12 = 1.5% = 0.015
    const pmt = ccPMT(0.015, 24, 3000);
    assert.ok(near(pmt, 149.77, 0.05), `got ${pmt.toFixed(4)}`);
});

test('zero interest: payment = principal / months', () => {
    assert.strictEqual(ccPMT(0, 12, 1200), 100);
});

test('single-period loan: payment = principal + one period interest', () => {
    // pmt = pv * r * (1+r)^1 / ((1+r)^1 - 1) = pv * r * (1+r) / r = pv * (1+r)
    const pmt = ccPMT(0.015, 1, 1000);
    assert.ok(near(pmt, 1015, 0.001), `got ${pmt.toFixed(4)}`);
});

// ── ccNPER ────────────────────────────────────────────────────────────────────
// ccNPER(monthlyRate, monthlyPayment, principal) → months to full payoff
console.log('\nccNPER');

test('round-trip with ccPMT: ccNPER(r, ccPMT(r,24,3000), 3000) ≈ 24', () => {
    const pmt  = ccPMT(0.015, 24, 3000);
    const nper = ccNPER(0.015, pmt, 3000);
    assert.ok(near(nper, 24, 0.001), `got ${nper.toFixed(4)}`);
});

test('zero interest: nper = principal / payment', () => {
    assert.strictEqual(ccNPER(0, 100, 1200), 12);
});

test('payment exactly equals one month interest → Infinity', () => {
    // 3000 * 0.015 = 45; paying exactly $45 never reduces the balance
    assert.strictEqual(ccNPER(0.015, 45, 3000), Infinity);
});

test('payment below one month interest → Infinity', () => {
    assert.strictEqual(ccNPER(0.015, 44, 3000), Infinity);
});

test('paying full balance in one month: nper ≈ 1', () => {
    // pmt = pv * (1 + r) so it covers principal + one month interest exactly
    const pmt  = 3000 * 1.015;
    const nper = ccNPER(0.015, pmt, 3000);
    assert.ok(near(nper, 1, 0.0001), `got ${nper.toFixed(4)}`);
});

// ── mcPMT / mcPV / mcNPER ─────────────────────────────────────────────────────
// These three form a trio: each is the inverse of the others.
console.log('\nmcPMT / mcPV / mcNPER round-trips');

test('mcPV(r, n, mcPMT(r, n, pv)) ≈ pv  — $500k mortgage, 6% p.a., 25 years', () => {
    // rate = 6% / 12 = 0.5% per month, nper = 300 months
    const pv     = 500000;
    const rate   = 0.005;
    const nper   = 300;
    const pmt    = mcPMT(rate, nper, pv);
    const pvBack = mcPV(rate, nper, pmt);
    assert.ok(near(pvBack, pv, 0.01), `got ${pvBack.toFixed(2)}`);
});

test('mcNPER(r, mcPMT(r, n, pv), pv) ≈ n  — same mortgage', () => {
    const pv   = 500000;
    const rate = 0.005;
    const nper = 300;
    const pmt  = mcPMT(rate, nper, pv);
    const n    = mcNPER(rate, pmt, pv);
    assert.ok(near(n, nper, 0.001), `got ${n.toFixed(4)}`);
});

test('zero interest: mcPMT = pv / nper', () => {
    assert.strictEqual(mcPMT(0, 10, 1000), 100);
});

test('zero interest: mcPV = pmt * nper', () => {
    assert.strictEqual(mcPV(0, 10, 100), 1000);
});

test('zero interest: mcNPER = pv / pmt', () => {
    assert.strictEqual(mcNPER(0, 100, 1000), 10);
});

// ── simulateMinRepayments ─────────────────────────────────────────────────────
// simulateMinRepayments(pv, monthlyRate, minRatePct, minAmtDollar)
// → { months, totalInterest, totalPaid, firstRepayment }
console.log('\nsimulateMinRepayments');

// Baseline: $3,000 at 18% p.a., 2% minimum, $20 floor
const baseline = simulateMinRepayments(3000, 0.015, 0.02, 20);

test('accounting identity: totalPaid = pv + totalInterest', () => {
    // Every dollar paid either reduces principal or covers interest, so this must hold.
    assert.ok(near(baseline.totalPaid, 3000 + baseline.totalInterest, 0.01),
        `totalPaid=${baseline.totalPaid.toFixed(2)}, pv+interest=${(3000 + baseline.totalInterest).toFixed(2)}`);
});

test('firstRepayment = max(pv * minRatePct, minAmtDollar) = $60', () => {
    // max(3000 * 0.02, 20) = max(60, 20) = 60
    assert.strictEqual(baseline.firstRepayment, 60);
});

test('takes many months (minimum repayments on 18% debt are very slow)', () => {
    // At 1.5%/month interest vs 2% repayment, net paydown is only 0.5%/month.
    assert.ok(baseline.months > 100, `got ${baseline.months} months`);
});

test('dollar floor kicks in: small balance uses $20 floor not 2%', () => {
    // $500 balance: 2% = $10, floor = $20, so firstRepayment should be $20
    const small = simulateMinRepayments(500, 0.015, 0.02, 20);
    assert.strictEqual(small.firstRepayment, 20);
});

test('zero interest: accounting identity still holds', () => {
    const noInt = simulateMinRepayments(3000, 0, 0.02, 20);
    assert.ok(near(noInt.totalPaid, 3000 + noInt.totalInterest, 0.01));
    assert.ok(near(noInt.totalInterest, 0, 0.001), `expected 0 interest, got ${noInt.totalInterest}`);
});

test('paying full balance in one shot', () => {
    // minAmtDollar > pv causes payoff in month 1
    const oneShot = simulateMinRepayments(500, 0.015, 0.02, 10000);
    assert.strictEqual(oneShot.months, 1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
if (failed === 0) {
    console.log(`All ${passed} tests passed.\n`);
} else {
    console.log(`${passed} passed, ${failed} failed.\n`);
    process.exit(1);
}