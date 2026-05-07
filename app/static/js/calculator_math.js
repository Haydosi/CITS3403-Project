// ── Pure financial math — no DOM dependencies ─────────────────────────────────
//
// Shared by debt_calculator.js (browser) and tests/test_calculator.js (Node).
// The module.exports block at the bottom is a no-op in the browser.
//
// Variable naming follows standard finance convention:
//   pv   = Present Value  — principal / current balance
//   pmt  = Payment        — fixed periodic payment amount
//   rate = periodic interest rate (annual rate ÷ periods per year, as a decimal)
//   nper = Number of Periods — total payment count for the full loan term

// ── PMT ───────────────────────────────────────────────────────────────────────
// Fixed payment required each period to fully repay pv over nper periods.
// Formula: pmt = pv * rate * (1 + rate)^nper / ((1 + rate)^nper − 1)
function mcPMT(rate, nper, pv) {
    if (rate === 0) return pv / nper;
    var term = Math.pow(1 + rate, nper);
    return pv * rate * term / (term - 1);
}

// ── PV ────────────────────────────────────────────────────────────────────────
// Maximum principal that can be borrowed given a fixed pmt, rate, and nper.
// This is the PMT formula rearranged and solved for pv.
function mcPV(rate, nper, pmt) {
    if (rate === 0) return pmt * nper;
    var term = Math.pow(1 + rate, nper);
    return pmt * (term - 1) / (rate * term);
}

// ── NPER ──────────────────────────────────────────────────────────────────────
// Number of periods required to repay pv with a fixed pmt at the given rate.
// Formula: n = log(pmt / (pmt − rate * pv)) / log(1 + rate)
// pmt must exceed one period's interest (rate * pv), otherwise result is invalid.
function mcNPER(rate, pmt, pv) {
    if (rate === 0) return pv / pmt;
    return Math.log(pmt / (pmt - rate * pv)) / Math.log(1 + rate);
}

// ── ccPMT ─────────────────────────────────────────────────────────────────────
// Credit-card variant of PMT — same formula as mcPMT, exposed under a separate
// name so callers are explicit about monthly-compounding context.
// monthlyRate = annualRate / 100 / 12
function ccPMT(monthlyRate, numMonths, principal) {
    if (monthlyRate === 0) return principal / numMonths;
    var term = Math.pow(1 + monthlyRate, numMonths);
    return principal * monthlyRate * term / (term - 1);
}

// ── ccNPER ────────────────────────────────────────────────────────────────────
// Months needed to repay `principal` at a fixed monthly payment.
// Formula: n = −log(1 − pv*r / pmt) / log(1 + r)
// Returns Infinity when pmt ≤ pv * monthlyRate (payment doesn't cover interest).
function ccNPER(monthlyRate, monthlyPayment, principal) {
    if (monthlyRate === 0) return principal / monthlyPayment;
    if (monthlyPayment <= principal * monthlyRate) return Infinity;
    return -Math.log(1 - principal * monthlyRate / monthlyPayment) / Math.log(1 + monthlyRate);
}

// ── simulateMinRepayments ─────────────────────────────────────────────────────
// Simulates a credit card being paid down using minimum repayments only.
// A formula-based approach cannot be used here because the minimum repayment
// shrinks each month as the balance falls, so we iterate period by period.
//
// Each period:
//   interest  = balance * monthlyRate
//   repayment = max(balance * minRatePct, minAmtDollar)  — the higher of % or $ floor
//   if balance ≤ repayment, the final payment clears the remainder (balance + interest)
//
// Invariant: totalPaid = pv + totalInterest  (money out = principal + interest)
//
// Parameters:
//   pv           — starting card balance ($)
//   monthlyRate  — monthly interest rate as a decimal (e.g. 0.015 for 18% p.a.)
//   minRatePct   — minimum repayment as a fraction of balance (e.g. 0.02 for 2%)
//   minAmtDollar — minimum repayment fixed dollar floor (e.g. 20 for $20)
//
// Returns: { months, totalInterest, totalPaid, firstRepayment }
function simulateMinRepayments(pv, monthlyRate, minRatePct, minAmtDollar) {
    var balance          = pv;
    var totalInterest    = 0;
    var totalPaid        = 0;
    var firstRepayment   = 0;
    var months           = 0;

    for (var i = 1; i <= 2400; i++) {  // cap at 200 years to prevent infinite loops
        var interest  = balance * monthlyRate;
        var repayment = Math.max(balance * minRatePct, minAmtDollar);
        if (balance <= repayment) { repayment = balance + interest; }  // final payment
        totalInterest += interest;
        totalPaid     += repayment;
        balance        = balance + interest - repayment;
        if (i === 1) { firstRepayment = Math.ceil(repayment); }  // record for slider min
        if (balance <= 0.005) { months = i; break; }             // sub-cent = fully repaid
    }
    if (months === 0) months = 2400;  // loop exhausted without converging

    return { months: months, totalInterest: totalInterest, totalPaid: totalPaid, firstRepayment: firstRepayment };
}

// ── Export (Node.js only) ─────────────────────────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = { mcPMT, mcPV, mcNPER, ccPMT, ccNPER, simulateMinRepayments };
}