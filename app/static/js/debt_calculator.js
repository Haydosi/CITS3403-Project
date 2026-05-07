// Tab switching and mortgage calculator
(function () {
    const tabs = [
        { btn: 'tabPersonalLoan', section: 'sectionPersonalLoan' },
        { btn: 'tabCreditCard',   section: 'sectionCreditCard'   },
        { btn: 'tabMortgage',     section: 'sectionMortgage'     },
    ];

    tabs.forEach(({ btn, section }) => {
        document.getElementById(btn).addEventListener('click', function () {
            tabs.forEach(t => {
                document.getElementById(t.btn).classList.remove('active');
                document.getElementById(t.section).classList.add('hidden-section');
            });
            this.classList.add('active');
            document.getElementById(section).classList.remove('hidden-section');
        });
    });

    // Sidebar toggle (shared pattern from other pages)
    const toggle  = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('show');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        });
    }
}());

// ── Personal Loan Calculator ───────────────────────────────────────────────
(function () {

    // mcPMT, mcPV, mcNPER are defined in calculator_math.js.
    // Naming: pv = principal, pmt = periodic payment, rate = periodic rate, nper = total periods, freq = payments/year.
    // Personal loan max term: 15 years.

    function fmtCurrency(v) {
        if (!isFinite(v) || v < 0) return 'N/A';
        return '$' + Math.round(v).toLocaleString('en-AU');
    }

    function freqLabel(f) {
        return { 52: 'per week', 26: 'per fortnight', 12: 'per month', 4: 'per quarter', 1: 'per year' }[f] || '';
    }

    function timeLabel(nPeriods, freq) {
        var totalYears = nPeriods / freq;
        var years  = Math.floor(totalYears);
        var months = Math.ceil((totalYears % 1) * 12);
        if (months === 12) { months = 0; years++; }
        var s = '';
        if (years  > 0) s += years  + (years  === 1 ? ' year'  : ' years');
        if (months > 0) s += (s ? ' ' : '') + months + (months === 1 ? ' month' : ' months');
        return s || '0 months';
    }

    function showError(id, msg) {
        var el = document.getElementById(id);
        el.textContent = msg;
        el.classList.remove('d-none');
    }
    function clearError(id) {
        document.getElementById(id).classList.add('d-none');
    }

    var plChart = null;

    function renderDonut(principal, interest) {
        var ctx    = document.getElementById('pl-donut').getContext('2d');
        var colors  = ['#2dd4a8', '#3b82f6'];
        var labels  = ['Principal', 'Interest'];
        var amounts = [Math.max(0, principal), Math.max(0, interest)];

        if (plChart) {
            plChart.data.datasets[0].data = amounts;
            plChart.update();
        } else {
            plChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
                },
                options: {
                    cutout: '68%',
                    plugins: { legend: { display: false } },
                    animation: { duration: 500 }
                }
            });
        }

        document.getElementById('pl-legend').innerHTML = labels.map(function (l, i) {
            return '<div class="mc-legend-item">' +
                '<div class="mc-legend-dot" style="background:' + colors[i] + '"></div>' +
                '<div><span class="mc-legend-name">' + l + '</span>' +
                '<span class="mc-legend-amount">' + fmtCurrency(amounts[i]) + '</span></div>' +
                '</div>';
        }).join('');
    }

    function showResults(heroLabel, heroValue, heroSub,
                         c1Label, c1Val, c2Label, c2Val, c3Label, c3Val,
                         principal, interest) {
        document.getElementById('pl-empty').classList.add('d-none');
        document.getElementById('pl-results').classList.remove('d-none');

        document.getElementById('pl-hero-label').textContent = heroLabel;
        document.getElementById('pl-hero-value').textContent = heroValue;
        document.getElementById('pl-hero-sub').textContent   = heroSub;

        document.getElementById('pl-c1-label').textContent = c1Label;
        document.getElementById('pl-c1-value').textContent = c1Val;
        document.getElementById('pl-c2-label').textContent = c2Label;
        document.getElementById('pl-c2-value').textContent = c2Val;
        document.getElementById('pl-c3-label').textContent = c3Label;
        document.getElementById('pl-c3-value').textContent = c3Val;

        renderDonut(principal, interest);
    }

    // ── Mode 1: Repayments ─────────────────────────────────────────────────
    document.getElementById('pl-btn-repayments').addEventListener('click', function () {
        clearError('pl-r-error');
        var amount  = parseFloat(document.getElementById('pl-r-amount').value);
        var rate    = parseFloat(document.getElementById('pl-r-rate').value);
        var term    = Math.min(parseInt(document.getElementById('pl-r-term').value) || 0, 15);
        var freq    = parseInt(document.getElementById('pl-r-freq').value);
        var fee     = parseFloat(document.getElementById('pl-r-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('pl-r-feefreq').value);

        if (!amount || !rate || !term) {
            showError('pl-r-error', 'Please fill in Amount Borrowed, Interest Rate, and Loan Term.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var nper          = term * freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var payment       = mcPMT(periodRate, nper, amount) + feesPerPeriod;
        var totalPaid     = payment * nper;
        var totalInterest = totalPaid - amount;

        showResults(
            'Repayment Amount',
            fmtCurrency(payment) + ' ' + freqLabel(freq),
            'over ' + term + ' year' + (term === 1 ? '' : 's') + ' at ' + rate + '% p.a.',
            'Total Repayments', fmtCurrency(totalPaid),
            'Total Interest',   fmtCurrency(totalInterest),
            'Principal Borrowed', fmtCurrency(amount),
            amount, totalInterest
        );
    });

    // ── Mode 2: Borrowing capacity ─────────────────────────────────────────
    document.getElementById('pl-btn-borrow').addEventListener('click', function () {
        clearError('pl-b-error');
        var payment = parseFloat(document.getElementById('pl-b-payment').value);
        var freq    = parseInt(document.getElementById('pl-b-freq').value);
        var rate    = parseFloat(document.getElementById('pl-b-rate').value);
        var term    = Math.min(parseInt(document.getElementById('pl-b-term').value) || 0, 15);
        var fee     = parseFloat(document.getElementById('pl-b-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('pl-b-feefreq').value);

        if (!payment || !rate || !term) {
            showError('pl-b-error', 'Please fill in Affordable Repayment, Interest Rate, and Loan Term.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var nper          = term * freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var netPayment    = payment - feesPerPeriod;

        if (netPayment <= 0) {
            showError('pl-b-error', 'Repayment is too low to cover fees. Please increase the repayment or reduce fees.');
            return;
        }

        var principal = mcPV(periodRate, nper, netPayment);
        if (!isFinite(principal) || principal <= 0) {
            showError('pl-b-error', 'Repayment is too low to cover interest. Please increase the repayment amount.');
            return;
        }

        var totalPaid     = payment * nper;
        var totalInterest = totalPaid - principal;

        showResults(
            'Borrowing Capacity',
            fmtCurrency(principal),
            'Repay ' + fmtCurrency(payment) + ' ' + freqLabel(freq) + ' over ' + term + ' year' + (term === 1 ? '' : 's') + ' at ' + rate + '% p.a.',
            'Total Repayments',  fmtCurrency(totalPaid),
            'Total Interest',    fmtCurrency(totalInterest),
            'Borrowing Capacity', fmtCurrency(principal),
            principal, totalInterest
        );
    });

    // ── Mode 3: Repay sooner ───────────────────────────────────────────────
    document.getElementById('pl-btn-sooner').addEventListener('click', function () {
        clearError('pl-s-error');
        var amount  = parseFloat(document.getElementById('pl-s-amount').value);
        var payment = parseFloat(document.getElementById('pl-s-payment').value);
        var freq    = parseInt(document.getElementById('pl-s-freq').value);
        var rate    = parseFloat(document.getElementById('pl-s-rate').value);
        var fee     = parseFloat(document.getElementById('pl-s-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('pl-s-feefreq').value);

        if (!amount || !payment || !rate) {
            showError('pl-s-error', 'Please fill in Amount Owing, Repayment, and Interest Rate.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var netPayment    = payment - feesPerPeriod;

        if (netPayment <= periodRate * amount) {
            showError('pl-s-error', 'Repayment is too low to cover interest. Please increase your repayment.');
            return;
        }

        var nPeriods      = mcNPER(periodRate, netPayment, amount);
        var totalPaid     = payment * nPeriods;
        var totalInterest = totalPaid - amount;

        showResults(
            'Time to Repay',
            timeLabel(nPeriods, freq),
            'Paying ' + fmtCurrency(payment) + ' ' + freqLabel(freq) + ' at ' + rate + '% p.a.',
            'Total Repayments', fmtCurrency(totalPaid),
            'Total Interest',   fmtCurrency(totalInterest),
            'Amount Owing',     fmtCurrency(amount),
            amount, totalInterest
        );
    });

    // ── Mode panel switching ───────────────────────────────────────────────
    document.querySelectorAll('[data-pl-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('[data-pl-mode]').forEach(function (b) { b.classList.remove('active'); });
            document.querySelectorAll('.pl-mode-panel').forEach(function (p) { p.classList.add('d-none'); });
            this.classList.add('active');
            document.getElementById('pl-panel-' + this.dataset.plMode).classList.remove('d-none');
        });
    });

}());

// ── Mortgage Calculator ────────────────────────────────────────────────────
(function () {

    // ── Financial formulas ─────────────────────────────────────────────────
    // mcPMT, mcPV, mcNPER are defined in calculator_math.js (loaded before this file).
    //
    // Variable naming follows standard finance convention used throughout:
    //   pv   = Present Value  — the loan principal (amount borrowed today)
    //   pmt  = Payment        — the fixed periodic payment amount
    //   rate = periodic interest rate (annual rate ÷ periods per year)
    //   nper = Number of Periods — total number of payments over the loan term
    //   freq = payment Frequency — payments per year (52=weekly, 26=fortnightly, 12=monthly, etc.)

    // ── Formatting helpers ─────────────────────────────────────────────────
    function fmtCurrency(v) {
        if (!isFinite(v) || v < 0) return 'N/A';
        return '$' + Math.round(v).toLocaleString('en-AU');
    }

    // Maps the numeric freq value to a human-readable frequency label.
    function freqLabel(f) {
        return { 52: 'per week', 26: 'per fortnight', 12: 'per month', 4: 'per quarter', 1: 'per year' }[f] || '';
    }

    // Converts a fractional number of periods into a "X years Y months" string.
    // nPeriods is in units of freq (e.g. weeks if freq=52), so divide by freq to get years.
    function timeLabel(nPeriods, freq) {
        var totalYears = nPeriods / freq;
        var years  = Math.floor(totalYears);
        var months = Math.ceil((totalYears % 1) * 12);
        if (months === 12) { months = 0; years++; }
        var s = '';
        if (years  > 0) s += years  + (years  === 1 ? ' year'  : ' years');
        if (months > 0) s += (s ? ' ' : '') + months + (months === 1 ? ' month' : ' months');
        return s || '0 months';
    }

    // ── Error helper ───────────────────────────────────────────────────────
    function showError(id, msg) {
        var el = document.getElementById(id);
        el.textContent = msg;
        el.classList.remove('d-none');
    }
    function clearError(id) {
        var el = document.getElementById(id);
        el.classList.add('d-none');
    }

    // ── Chart.js donut ─────────────────────────────────────────────────────
    var mcChart = null;

    function renderDonut(principal, interest) {
        var ctx = document.getElementById('mc-donut').getContext('2d');
        var colors  = ['#2dd4a8', '#3b82f6'];
        var labels  = ['Principal', 'Interest'];
        var amounts = [Math.max(0, principal), Math.max(0, interest)];

        if (mcChart) {
            // Reuse the existing Chart instance to avoid re-animating from scratch
            mcChart.data.datasets[0].data = amounts;
            mcChart.update();
        } else {
            mcChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
                },
                options: {
                    cutout: '68%',
                    plugins: { legend: { display: false } },
                    animation: { duration: 500 }
                }
            });
        }

        document.getElementById('mc-legend').innerHTML = labels.map(function (l, i) {
            return '<div class="mc-legend-item">' +
                '<div class="mc-legend-dot" style="background:' + colors[i] + '"></div>' +
                '<div><span class="mc-legend-name">' + l + '</span>' +
                '<span class="mc-legend-amount">' + fmtCurrency(amounts[i]) + '</span></div>' +
                '</div>';
        }).join('');
    }

    // ── Render results panel ───────────────────────────────────────────────
    // c1/c2/c3 = the three metric cards below the hero value
    function showResults(heroLabel, heroValue, heroSub,
                         c1Label, c1Val, c2Label, c2Val, c3Label, c3Val,
                         principal, interest) {
        document.getElementById('mc-empty').classList.add('d-none');
        document.getElementById('mc-results').classList.remove('d-none');

        document.getElementById('mc-hero-label').textContent = heroLabel;
        document.getElementById('mc-hero-value').textContent = heroValue;
        document.getElementById('mc-hero-sub').textContent   = heroSub;

        document.getElementById('mc-c1-label').textContent = c1Label;
        document.getElementById('mc-c1-value').textContent = c1Val;
        document.getElementById('mc-c2-label').textContent = c2Label;
        document.getElementById('mc-c2-value').textContent = c2Val;
        document.getElementById('mc-c3-label').textContent = c3Label;
        document.getElementById('mc-c3-value').textContent = c3Val;

        renderDonut(principal, interest);
    }

    // ── Mode 1: Repayments ─────────────────────────────────────────────────
    // Given pv (amount borrowed), rate, term, and freq, calculate the fixed pmt.
    document.getElementById('mc-btn-repayments').addEventListener('click', function () {
        clearError('mc-r-error');
        var amount  = parseFloat(document.getElementById('mc-r-amount').value);  // pv
        var rate    = parseFloat(document.getElementById('mc-r-rate').value);    // annual rate %
        var term    = parseInt(document.getElementById('mc-r-term').value);      // years
        var freq    = parseInt(document.getElementById('mc-r-freq').value);      // payments per year
        var fee     = parseFloat(document.getElementById('mc-r-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('mc-r-feefreq').value);  // fee frequency (periods per year)

        if (!amount || !rate || !term) {
            showError('mc-r-error', 'Please fill in Amount Borrowed, Interest Rate, and Loan Term.');
            return;
        }

        var periodRate    = (rate / 100) / freq;          // rate per payment period
        var nper          = term * freq;                  // total number of payments
        var feesPerPeriod = (fee * feeFreq) / freq;       // fees converted to per-payment-period cost
        var payment       = mcPMT(periodRate, nper, amount) + feesPerPeriod;
        var totalPaid     = payment * nper;
        var totalInterest = totalPaid - amount;

        showResults(
            'Repayment Amount',
            fmtCurrency(payment) + ' ' + freqLabel(freq),
            'over ' + term + ' years at ' + rate + '% p.a.',
            'Total Repayments', fmtCurrency(totalPaid),
            'Total Interest',   fmtCurrency(totalInterest),
            'Principal Borrowed', fmtCurrency(amount),
            amount, totalInterest
        );
    });

    // ── Mode 2: Borrowing capacity ─────────────────────────────────────────
    // Given an affordable pmt, rate, and term, calculate the maximum pv (borrowing capacity).
    document.getElementById('mc-btn-borrow').addEventListener('click', function () {
        clearError('mc-b-error');
        var payment = parseFloat(document.getElementById('mc-b-payment').value);  // affordable pmt
        var freq    = parseInt(document.getElementById('mc-b-freq').value);       // payments per year
        var rate    = parseFloat(document.getElementById('mc-b-rate').value);     // annual rate %
        var term    = parseInt(document.getElementById('mc-b-term').value);       // years
        var fee     = parseFloat(document.getElementById('mc-b-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('mc-b-feefreq').value);

        if (!payment || !rate || !term) {
            showError('mc-b-error', 'Please fill in Affordable Repayment, Interest Rate, and Loan Term.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var nper          = term * freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var netPayment    = payment - feesPerPeriod;  // portion of pmt available for principal+interest after fees

        if (netPayment <= 0) {
            showError('mc-b-error', 'Repayment is too low to cover fees. Please increase the repayment or reduce fees.');
            return;
        }

        var principal     = mcPV(periodRate, nper, netPayment);  // pv = max borrowing capacity
        if (!isFinite(principal) || principal <= 0) {
            showError('mc-b-error', 'Repayment is too low to cover interest. Please increase the repayment amount.');
            return;
        }

        var totalPaid     = payment * nper;
        var totalInterest = totalPaid - principal;

        showResults(
            'Borrowing Capacity',
            fmtCurrency(principal),
            'Repay ' + fmtCurrency(payment) + ' ' + freqLabel(freq) + ' over ' + term + ' years at ' + rate + '% p.a.',
            'Total Repayments',  fmtCurrency(totalPaid),
            'Total Interest',    fmtCurrency(totalInterest),
            'Borrowing Capacity', fmtCurrency(principal),
            principal, totalInterest
        );
    });

    // ── Mode 3: Repay sooner ───────────────────────────────────────────────
    // Given pv (amount still owing) and a fixed pmt, calculate nper (time to pay off).
    document.getElementById('mc-btn-sooner').addEventListener('click', function () {
        clearError('mc-s-error');
        var amount  = parseFloat(document.getElementById('mc-s-amount').value);   // pv (current balance)
        var payment = parseFloat(document.getElementById('mc-s-payment').value);  // pmt per period
        var freq    = parseInt(document.getElementById('mc-s-freq').value);       // payments per year
        var rate    = parseFloat(document.getElementById('mc-s-rate').value);     // annual rate %
        var fee     = parseFloat(document.getElementById('mc-s-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('mc-s-feefreq').value);

        if (!amount || !payment || !rate) {
            showError('mc-s-error', 'Please fill in Amount Owing, Repayment, and Interest Rate.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var netPayment    = payment - feesPerPeriod;  // portion of pmt going to principal+interest

        if (netPayment <= periodRate * amount) {
            showError('mc-s-error', 'Repayment is too low to cover interest. Please increase your repayment.');
            return;
        }

        var nPeriods      = mcNPER(periodRate, netPayment, amount);  // number of periods to full payoff
        var totalPaid     = payment * nPeriods;
        var totalInterest = totalPaid - amount;

        showResults(
            'Time to Repay',
            timeLabel(nPeriods, freq),
            'Paying ' + fmtCurrency(payment) + ' ' + freqLabel(freq) + ' at ' + rate + '% p.a.',
            'Total Repayments', fmtCurrency(totalPaid),
            'Total Interest',   fmtCurrency(totalInterest),
            'Amount Owing',     fmtCurrency(amount),
            amount, totalInterest
        );
    });

    // ── Mode panel switching ───────────────────────────────────────────────
    var mcSection = document.getElementById('sectionMortgage');
    mcSection.querySelectorAll('.mc-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            mcSection.querySelectorAll('.mc-mode-btn').forEach(function (b) { b.classList.remove('active'); });
            mcSection.querySelectorAll('.mc-mode-panel').forEach(function (p) { p.classList.add('d-none'); });
            this.classList.add('active');
            document.getElementById('mc-panel-' + this.dataset.mode).classList.remove('d-none');
        });
    });

}());

// ── Credit Card Calculator ────────────────────────────────────────────────────
(function () {

    // Variable naming used throughout this section:
    //   pv           = Present Value — the current card balance (amount owed today)
    //   annualRate   = annual interest rate as a percentage (e.g. 18 for 18%)
    //   monthlyRate  = periodic interest rate per month (annualRate / 100 / 12)
    //   minRatePct   = minimum repayment as a fraction of the closing balance (e.g. 0.02 for 2%)
    //   minAmtDollar = minimum repayment as a fixed dollar floor (e.g. $20)
    //   minFirst     = the actual first minimum repayment amount (higher of % or $ floor)
    //   nper / nperHigher = Number of Periods (months) to fully repay the debt

    var ccChart = null;
    var ccMinFirstRepayment = 20;  // kept in outer scope so slider event can clamp against it

    // ── Financial formulas ─────────────────────────────────────────────────
    // ccPMT, ccNPER, simulateMinRepayments are defined in calculator_math.js.

    // ── Formatting helpers ─────────────────────────────────────────────────
    function fmtMoney(v) {
        if (!isFinite(v) || v < 0) return 'N/A';
        return '$' + Math.round(v).toLocaleString('en-AU');
    }

    // Converts a fractional month count to a "X years Y months" string.
    // Math.ceil rounds up so the label reflects the last partial month as a full month.
    function timeLabel(totalMonths) {
        var m = Math.ceil(totalMonths);
        var y = Math.floor(m / 12);
        var rem = m % 12;
        var s = '';
        if (y > 0) s += y + (y === 1 ? ' year ' : ' years ');
        if (rem > 0) s += rem + (rem === 1 ? ' month' : ' months');
        return s.trim() || '< 1 month';
    }

    // Sets the teal fill bar width to match the slider thumb position (0–100%).
    function updateSliderFill(slider) {
        var min = parseFloat(slider.min);
        var max = parseFloat(slider.max);
        var pct = (max === min) ? 0 : Math.min(100, Math.max(0, (parseFloat(slider.value) - min) / (max - min) * 100));
        document.getElementById('cc-slider-fill').style.width = pct + '%';
    }

    // ── Core calculation ───────────────────────────────────────────────────
    // `higherPayment` is optional — omit on first run to auto-default to 2-year payoff.
    function calculate(higherPayment) {
        var pv           = parseFloat(document.getElementById('cc-amount').value);
        var annualRate   = parseFloat(document.getElementById('cc-rate').value);
        var minRatePct   = parseFloat(document.getElementById('cc-minrate').value) / 100;  // e.g. 2% → 0.02
        var minAmtDollar = parseFloat(document.getElementById('cc-minamt').value);         // e.g. $20

        var errorEl = document.getElementById('cc-error');
        errorEl.classList.add('d-none');

        if (!pv || pv <= 0 || !annualRate || annualRate <= 0) {
            errorEl.textContent = 'Please enter a valid amount owing and interest rate.';
            errorEl.classList.remove('d-none');
            return;
        }

        var monthlyRate = annualRate / 100 / 12;  // convert annual % to monthly decimal

        // ── Minimum repayment: simulate month-by-month ────────────────────
        // Delegated to simulateMinRepayments() in calculator_math.js.
        // Minimum repayments decrease each month as the balance shrinks, so a
        // formula-based NPER can't be used — the helper iterates period by period.
        var minSim           = simulateMinRepayments(pv, monthlyRate, minRatePct, minAmtDollar);
        var totalInterestMin = minSim.totalInterest;
        var totalPaidMin     = minSim.totalPaid;
        var minFirst         = minSim.firstRepayment;
        var months           = minSim.months;

        ccMinFirstRepayment = minFirst;

        // ── Higher repayment: fixed amount, formula-based ─────────────────
        // Default = the pmt required to clear the full balance in exactly 24 months (2 years),
        // matching the benchmark shown on Australian credit card statements.
        var defaultHigher = Math.ceil(ccPMT(monthlyRate, 24, pv));
        if (higherPayment === undefined) {
            higherPayment = Math.max(defaultHigher, minFirst);
        }
        higherPayment = Math.max(higherPayment, minFirst);  // can't go below minimum
        if (higherPayment > pv) higherPayment = pv;         // can't overpay

        if (monthlyRate > 0 && higherPayment <= pv * monthlyRate) {
            errorEl.textContent = 'Repayment is too low to cover interest. Please increase the amount.';
            errorEl.classList.remove('d-none');
            return;
        }

        var nperHigher          = ccNPER(monthlyRate, higherPayment, pv);   // months to full payoff
        var totalPaidHigher     = higherPayment * nperHigher;               // total cash outflow
        var totalInterestHigher = Math.max(0, totalPaidHigher - pv);        // interest portion of outflow
        var savings             = Math.max(0, totalInterestMin - totalInterestHigher);  // interest saved vs minimum

        // ── Update slider bounds and position ─────────────────────────────
        // Slider range: minFirst (= minimum repayment) to 5× minFirst.
        var sliderMin = minFirst;
        var sliderMax = Math.max(minFirst * 5, minFirst + 1);
        var slider    = document.getElementById('cc-slider');
        slider.min   = sliderMin;
        slider.max   = sliderMax;
        slider.value = Math.min(Math.round(higherPayment), sliderMax);
        document.getElementById('cc-payment-input').value = Math.round(higherPayment);
        document.getElementById('cc-slider-min-label').textContent = fmtMoney(sliderMin) + ' /mo';
        document.getElementById('cc-slider-max-label').textContent = fmtMoney(sliderMax) + ' /mo';
        updateSliderFill(slider);

        // ── Update result values in the DOM ───────────────────────────────
        document.getElementById('cc-min-first').textContent    = fmtMoney(minFirst) + ' /mo';
        document.getElementById('cc-min-time').textContent     = timeLabel(months);
        document.getElementById('cc-min-interest').textContent = fmtMoney(totalInterestMin);
        document.getElementById('cc-min-total').textContent    = fmtMoney(totalPaidMin);

        document.getElementById('cc-hi-payment').textContent  = fmtMoney(Math.round(higherPayment)) + ' /mo';
        document.getElementById('cc-hi-time').textContent     = timeLabel(nperHigher);
        document.getElementById('cc-hi-interest').textContent = fmtMoney(totalInterestHigher);
        document.getElementById('cc-hi-total').textContent    = fmtMoney(totalPaidHigher);

        document.getElementById('cc-savings').textContent = fmtMoney(savings);

        // ── Show results panel (hidden until first calculation) ────────────
        document.getElementById('cc-empty').classList.add('d-none');
        document.getElementById('cc-results').classList.remove('d-none');

        // ── Render stacked bar chart ───────────────────────────────────────
        // Both bars share the same principal (pv), so the height difference between
        // them is entirely due to the difference in total interest paid.
        renderCCChart(pv, totalInterestMin, pv, totalInterestHigher);
    }

    // ── Chart.js stacked bar chart ─────────────────────────────────────────
    // Each bar = principal (bottom, teal) stacked with interest (top, blue).
    // Destroy and recreate on each call so slider changes update the chart cleanly.
    function renderCCChart(principal, interestMin, principalHi, interestHi) {
        var ctx = document.getElementById('cc-chart').getContext('2d');
        if (ccChart) { ccChart.destroy(); }

        ccChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Minimum Repayments', 'Higher Repayments'],
                datasets: [
                    {
                        label: 'Principal',
                        data: [Math.round(principal), Math.round(principalHi)],
                        backgroundColor: '#2dd4a8',
                        // Round bottom corners only (interest segment sits on top)
                        borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 },
                        borderSkipped: false,
                    },
                    {
                        label: 'Interest',
                        data: [Math.round(interestMin), Math.round(interestHi)],
                        backgroundColor: '#3b82f6',
                        // Round top corners only (sits on top of principal segment)
                        borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
                        borderSkipped: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17,24,32,0.95)',
                        titleColor: '#e8ecf1',
                        bodyColor: '#7a8ba3',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        callbacks: {
                            label: function (ctx) {
                                return ' ' + ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString('en-AU');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        border: { color: 'transparent' },
                        ticks: { color: '#7a8ba3', font: { family: 'Plus Jakarta Sans', size: 12 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        border: { color: 'transparent' },
                        ticks: {
                            color: '#7a8ba3',
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: function (v) { return '$' + v.toLocaleString('en-AU'); }
                        }
                    }
                }
            }
        });
    }

    // ── Event listeners ────────────────────────────────────────────────────
    document.getElementById('cc-btn-calc').addEventListener('click', function () {
        calculate();
    });

    // Allow Enter key in the two main input fields to trigger calculation
    ['cc-amount', 'cc-rate'].forEach(function (id) {
        document.getElementById(id).addEventListener('keydown', function (e) {
            if (e.key === 'Enter') calculate();
        });
    });

    // Advanced settings toggle — collapses/expands the min repayment controls
    document.getElementById('cc-adv-toggle').addEventListener('click', function () {
        var body     = document.getElementById('cc-adv-body');
        var expanded = this.getAttribute('aria-expanded') === 'true';
        body.classList.toggle('d-none', expanded);
        this.setAttribute('aria-expanded', String(!expanded));
    });

    // Slider drag — sync the numeric input and recalculate live
    document.getElementById('cc-slider').addEventListener('input', function () {
        var val = parseFloat(this.value);
        document.getElementById('cc-payment-input').value = Math.round(val);
        updateSliderFill(this);
        calculate(val);
    });

    // Direct numeric input — clamp to slider bounds and sync the slider thumb
    document.getElementById('cc-payment-input').addEventListener('change', function () {
        var val    = parseFloat(this.value);
        var slider = document.getElementById('cc-slider');
        var min    = parseFloat(slider.min);
        var max    = parseFloat(slider.max);
        if (!isFinite(val) || val < min) { val = min; this.value = Math.round(min); }
        slider.value = Math.min(val, max);
        updateSliderFill(slider);
        calculate(val);
    });

}());