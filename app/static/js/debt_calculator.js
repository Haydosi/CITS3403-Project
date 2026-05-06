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

// ── Mortgage Calculator ────────────────────────────────────────────────────
(function () {

    // ── Financial formulas (matching MoneySmart / Excel behaviour) ─────────
    function mcPMT(rate, nper, pv) {
        if (rate === 0) return pv / nper;
        var term = Math.pow(1 + rate, nper);
        return pv * rate * term / (term - 1);
    }

    function mcPV(rate, nper, pmt) {
        if (rate === 0) return pmt * nper;
        var term = Math.pow(1 + rate, nper);
        return pmt * (term - 1) / (rate * term);
    }

    function mcNPER(rate, pmt, pv) {
        if (rate === 0) return pv / pmt;
        // pmt must exceed interest on pv each period, otherwise returns negative/NaN
        return Math.log(pmt / (pmt - rate * pv)) / Math.log(1 + rate);
    }

    // ── Formatting helpers ─────────────────────────────────────────────────
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
    document.getElementById('mc-btn-repayments').addEventListener('click', function () {
        clearError('mc-r-error');
        var amount  = parseFloat(document.getElementById('mc-r-amount').value);
        var rate    = parseFloat(document.getElementById('mc-r-rate').value);
        var term    = parseInt(document.getElementById('mc-r-term').value);
        var freq    = parseInt(document.getElementById('mc-r-freq').value);
        var fee     = parseFloat(document.getElementById('mc-r-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('mc-r-feefreq').value);

        if (!amount || !rate || !term) {
            showError('mc-r-error', 'Please fill in Amount Borrowed, Interest Rate, and Loan Term.');
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
            'over ' + term + ' years at ' + rate + '% p.a.',
            'Total Repayments', fmtCurrency(totalPaid),
            'Total Interest',   fmtCurrency(totalInterest),
            'Principal Borrowed', fmtCurrency(amount),
            amount, totalInterest
        );
    });

    // ── Mode 2: Borrowing capacity ─────────────────────────────────────────
    document.getElementById('mc-btn-borrow').addEventListener('click', function () {
        clearError('mc-b-error');
        var payment = parseFloat(document.getElementById('mc-b-payment').value);
        var freq    = parseInt(document.getElementById('mc-b-freq').value);
        var rate    = parseFloat(document.getElementById('mc-b-rate').value);
        var term    = parseInt(document.getElementById('mc-b-term').value);
        var fee     = parseFloat(document.getElementById('mc-b-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('mc-b-feefreq').value);

        if (!payment || !rate || !term) {
            showError('mc-b-error', 'Please fill in Affordable Repayment, Interest Rate, and Loan Term.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var nper          = term * freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var netPayment    = payment - feesPerPeriod;

        if (netPayment <= 0) {
            showError('mc-b-error', 'Repayment is too low to cover fees. Please increase the repayment or reduce fees.');
            return;
        }

        var principal     = mcPV(periodRate, nper, netPayment);
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
    document.getElementById('mc-btn-sooner').addEventListener('click', function () {
        clearError('mc-s-error');
        var amount  = parseFloat(document.getElementById('mc-s-amount').value);
        var payment = parseFloat(document.getElementById('mc-s-payment').value);
        var freq    = parseInt(document.getElementById('mc-s-freq').value);
        var rate    = parseFloat(document.getElementById('mc-s-rate').value);
        var fee     = parseFloat(document.getElementById('mc-s-fee').value)    || 0;
        var feeFreq = parseInt(document.getElementById('mc-s-feefreq').value);

        if (!amount || !payment || !rate) {
            showError('mc-s-error', 'Please fill in Amount Owing, Repayment, and Interest Rate.');
            return;
        }

        var periodRate    = (rate / 100) / freq;
        var feesPerPeriod = (fee * feeFreq) / freq;
        var netPayment    = payment - feesPerPeriod;

        if (netPayment <= periodRate * amount) {
            showError('mc-s-error', 'Repayment is too low to cover interest. Please increase your repayment.');
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
    document.querySelectorAll('.mc-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.mc-mode-btn').forEach(function (b) { b.classList.remove('active'); });
            document.querySelectorAll('.mc-mode-panel').forEach(function (p) { p.classList.add('d-none'); });
            this.classList.add('active');
            document.getElementById('mc-panel-' + this.dataset.mode).classList.remove('d-none');
        });
    });

}());