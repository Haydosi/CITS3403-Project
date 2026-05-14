// ─── Type config: maps transaction_type → display colour + label ─
const TYPE_CONFIG = {
    savings:  { color: '#10b981', label: 'Savings' },
    expense:  { color: '#f43f5e', label: 'Expense' },
    transfer: { color: '#3b82f6', label: 'Transfer' },
};
function typeConf(type) {
    return TYPE_CONFIG[type] || { color: '#64748b', label: type || 'Other' };
}

// ─── Dashboard Summary ─────────────────────────────────────────
let expenseChart = null;

async function loadDashboardSummary() {
    const res = await fetch('/api/private/dashboard/summary');
    if (!res.ok) return;
    const data = await res.json();
    renderStatCards(data);
    renderExpenseChart(data);
    renderTransactions(data.recent_transactions);
}

function fmt(amount) {
    const n = Number(amount);
    const s = Math.abs(n).toLocaleString('en-AU', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return (n < 0 ? '-' : '') + '$' + s;
}

function renderStatCards(data) {
    document.getElementById('statBalance').textContent = fmt(data.total_balance);
    document.getElementById('statIncome').textContent = fmt(data.monthly_income);
    document.getElementById('statExpenses').textContent = fmt(data.monthly_expenses);
    document.getElementById('statSavings').textContent = fmt(data.monthly_savings);
}

function renderExpenseChart(data) {
    const breakdown = data.expense_breakdown;
    const canvas = document.getElementById('expenseDonut');
    const legendEl = document.getElementById('chartLegend');
    const savedVal = document.getElementById('chartSavedValue');

    if (savedVal) savedVal.textContent = fmt(data.monthly_savings);

    if (!breakdown || !breakdown.length) {
        legendEl.innerHTML = '<div class="text-muted small text-center py-2" style="grid-column:1/-1">No transactions this month.</div>';
        if (!expenseChart) {
            expenseChart = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['No data'],
                    datasets: [{data: [1], backgroundColor: ['rgba(255,255,255,0.05)'], borderColor: 'transparent', borderWidth: 0}]
                },
                options: {cutout: '68%', responsive: true, maintainAspectRatio: true, plugins: {legend: {display: false}, tooltip: {enabled: false}}}
            });
        }
        return;
    }

    const labels = breakdown.map(e => typeConf(e.type).label);
    const amounts = breakdown.map(e => Math.abs(e.amount));
    const colors = breakdown.map(e => typeConf(e.type).color);

    const chartData = {
        labels,
        datasets: [{
            data: amounts,
            backgroundColor: colors,
            borderColor: 'transparent',
            borderWidth: 0,
            hoverBorderColor: '#fff',
            hoverBorderWidth: 2,
            spacing: 3,
            borderRadius: 4,
        }]
    };

    if (expenseChart) {
        expenseChart.data = chartData;
        expenseChart.update();
    } else {
        expenseChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: chartData,
            options: {
                cutout: '68%',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {display: false},
                    tooltip: {
                        backgroundColor: 'rgba(17,24,32,0.95)',
                        titleColor: '#e8ecf1',
                        bodyColor: '#7a8ba3',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        bodyFont: {family: 'Plus Jakarta Sans'},
                        titleFont: {family: 'Plus Jakarta Sans', weight: 600},
                        callbacks: {label: (ctx) => ` $${ctx.parsed.toLocaleString()}`}
                    }
                },
                animation: {animateRotate: true, duration: 1200, easing: 'easeOutQuart'}
            }
        });
    }

    legendEl.innerHTML = '';
    breakdown.forEach(e => {
        const conf = typeConf(e.type);
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<span class="legend-dot" style="background:${conf.color}"></span>${conf.label}<span class="legend-amount">${fmt(Math.abs(e.amount))}</span>`;
        legendEl.appendChild(item);
    });
}

// Builds a single transaction row using DOM methods — description is
// user-controlled so we must use textContent, not innerHTML, to prevent XSS.
function buildTxnRow(t) {
    const conf = typeConf(t.transaction_type);
    const amount = parseFloat(t.amount);
    const isExpense = amount < 0;
    const formatted = isExpense
        ? `-$${Math.abs(amount).toFixed(2)}`
        : `+$${amount.toFixed(2)}`;
    const dateObj = new Date(t.created_at);
    const dateStr = dateObj.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'});

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.className = 'txn-date';
    tdDate.textContent = dateStr;

    const tdCat = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'txn-category-pill';
    pill.style.cssText = `background:${conf.color}20; color:${conf.color}`;
    pill.textContent = conf.label;
    tdCat.appendChild(pill);

    const tdDesc = document.createElement('td');
    tdDesc.textContent = t.description || '—';

    const tdAmt = document.createElement('td');
    tdAmt.className = 'text-end';
    const amtSpan = document.createElement('span');
    amtSpan.className = `txn-amount ${isExpense ? 'expense' : 'income-txn'}`;
    amtSpan.textContent = formatted;
    tdAmt.appendChild(amtSpan);

    tr.append(tdDate, tdCat, tdDesc, tdAmt);
    return tr;
}

function renderTransactions(transactions) {
    const txnBody = document.getElementById('txnBody');
    txnBody.replaceChildren();
    if (!transactions || !transactions.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'text-center text-muted py-3';
        td.textContent = 'No transactions yet.';
        tr.appendChild(td);
        txnBody.appendChild(tr);
        return;
    }
    transactions.forEach(t => txnBody.appendChild(buildTxnRow(t)));
}

loadDashboardSummary();

// ─── Sidebar Toggle (mobile) ────────────────────────────────
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const toggle = document.getElementById('sidebarToggle');

toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
});
overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
});

// ─── Savings Targets ─────────────────────────────────────────
// Targets are loaded from the API and re-rendered after every change.
// Rows are built with createElement + textContent (NOT innerHTML) because
// target names/emojis are user-controlled — string interpolation would be a
// stored-XSS hole.
const STATUS_LABEL = {
    'on-track': 'On Track',
    'at-risk': 'At Risk',
    'behind': 'Behind',
    'completed': 'Completed',
};

let targets = [];

async function loadTargets() {
    const res = await fetch('/api/private/targets');
    if (!res.ok) return;
    const data = await res.json();
    targets = data.targets;
    renderTargets();
    renderMomentum();
}

function buildTargetItem(t) {
    const pct = Math.round(t.progress_percentage);

    const item = document.createElement('div');
    item.className = 'target-item';

    // Header: name + emoji on the left, badge + action buttons on the right.
    const header = document.createElement('div');
    header.className = 'target-header';

    const nameWrap = document.createElement('span');
    nameWrap.className = 'target-name';
    const emoji = document.createElement('span');
    emoji.className = 'target-emoji';
    emoji.textContent = t.emoji;
    nameWrap.append(emoji, ' ', document.createTextNode(t.name));

    const right = document.createElement('span');
    right.className = 'target-header-right';

    const badge = document.createElement('span');
    badge.className = `forecast-badge ${t.status}`;
    badge.textContent = STATUS_LABEL[t.status] || t.status;
    right.appendChild(badge);

    [['contribute', 'bi-plus-lg', 'Add contribution'],
     ['edit', 'bi-pencil', 'Edit target'],
     ['delete', 'bi-trash', 'Delete target']].forEach(([action, icon, title]) => {
        const btn = document.createElement('button');
        btn.className = 'target-action';
        btn.dataset.action = action;
        btn.dataset.id = t.id;
        btn.title = title;
        const i = document.createElement('i');
        i.className = `bi ${icon}`;
        btn.appendChild(i);
        right.appendChild(btn);
    });

    header.append(nameWrap, right);

    // Progress row: animated bar + "$current / $goal".
    const progRow = document.createElement('div');
    progRow.className = 'target-progress-row';

    const bar = document.createElement('div');
    bar.className = 'target-progress-bar';
    const fill = document.createElement('div');
    fill.className = `target-progress-fill ${t.status}`;
    fill.style.width = '0%';
    fill.dataset.width = `${pct}%`;
    bar.appendChild(fill);

    const amounts = document.createElement('span');
    amounts.className = 'target-amounts';
    const strong = document.createElement('strong');
    strong.textContent = `$${Number(t.current_amount).toLocaleString()}`;
    amounts.append(strong, ` / $${Number(t.target_amount).toLocaleString()}`);

    progRow.append(bar, amounts);
    item.append(header, progRow);
    return item;
}

function renderTargets() {
    const list = document.getElementById('targetsList');
    list.replaceChildren();
    document.getElementById('targetsCount').textContent = `${targets.length} active`;

    targets.forEach(t => list.appendChild(buildTargetItem(t)));

    // Let the bars animate from 0 once they are in the DOM.
    setTimeout(() => {
        document.querySelectorAll('.target-progress-fill').forEach(bar => {
            if (bar.dataset.width) bar.style.width = bar.dataset.width;
        });
    }, 100);
}

function renderMomentum() {
    const onTrack = targets.filter(t => t.status === 'on-track' || t.status === 'completed').length;
    const atRisk = targets.filter(t => t.status === 'at-risk').length;
    const behind = targets.filter(t => t.status === 'behind').length;
    const pctAchieved = targets.length ? Math.round((onTrack / targets.length) * 100) : 0;

    document.getElementById('momentumSet').textContent = targets.length;
    document.getElementById('momentumOnTrack').textContent = onTrack;
    document.getElementById('momentumAtRisk').textContent = atRisk;
    document.getElementById('momentumBehind').textContent = behind;

    const circumference = 2 * Math.PI * 50;
    setTimeout(() => {
        const arc = document.getElementById('momentumArc');
        const dashLen = (pctAchieved / 100) * circumference;
        arc.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
        arc.setAttribute('stroke-dasharray', `${dashLen} ${circumference}`);
        document.getElementById('momentumPct').textContent = `${pctAchieved}%`;
    }, 200);
}

// ─── New / Edit Target Modal ─────────────────────────────────
const targetModal = new bootstrap.Modal(document.getElementById('newTargetModal'));
const targetForm = document.getElementById('newTargetForm');

function openTargetModal(target) {
    targetForm.reset();
    document.getElementById('targetId').value = target ? target.id : '';
    document.getElementById('newTargetModalLabel').textContent = target ? 'Edit Target' : 'Set New Target';
    document.getElementById('saveTargetBtn').textContent = target ? 'Save Changes' : 'Create Target';
    if (target) {
        document.getElementById('targetName').value = target.name;
        document.getElementById('targetAmount').value = target.target_amount;
        document.getElementById('targetDeadline').value = target.deadline;
        document.getElementById('targetEmoji').value = target.emoji;
    }
    targetModal.show();
}

document.getElementById('newTargetBtn').addEventListener('click', () => openTargetModal(null));

document.getElementById('saveTargetBtn').addEventListener('click', async () => {
    if (!targetForm.checkValidity()) {
        targetForm.reportValidity();
        return;
    }
    const id = document.getElementById('targetId').value;
    const body = {
        name: document.getElementById('targetName').value,
        target_amount: parseFloat(document.getElementById('targetAmount').value),
        deadline: document.getElementById('targetDeadline').value,
        emoji: document.getElementById('targetEmoji').value,
    };
    const res = await fetch(id ? `/api/private/targets/${id}` : '/api/private/targets', {
        method: id ? 'PUT' : 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Could not save target.');
        return;
    }
    targetModal.hide();
    await loadTargets();
});

// Initial load.
loadTargets();

// ─── Target Actions: contribute / edit / delete ──────────────
const contributeModal = new bootstrap.Modal(document.getElementById('contributeModal'));
const contributeForm = document.getElementById('contributeForm');

document.getElementById('targetsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.target-action');
    if (!btn) return;
    const id = btn.dataset.id;
    const target = targets.find(t => String(t.id) === String(id));
    if (!target) return;

    if (btn.dataset.action === 'edit') {
        openTargetModal(target);
    } else if (btn.dataset.action === 'delete') {
        if (!confirm(`Delete "${target.name}"?`)) return;
        const res = await fetch(`/api/private/targets/${id}`, {method: 'DELETE'});
        if (res.ok) {
            await loadTargets();
        } else {
            alert('Could not delete target.');
        }
    } else if (btn.dataset.action === 'contribute') {
        contributeForm.reset();
        document.getElementById('contributeTargetId').value = id;
        document.getElementById('contributeTargetName').textContent = target.name;
        contributeModal.show();
    }
});

document.getElementById('saveContributeBtn').addEventListener('click', async () => {
    if (!contributeForm.checkValidity()) {
        contributeForm.reportValidity();
        return;
    }
    const id = document.getElementById('contributeTargetId').value;
    const amount = parseFloat(document.getElementById('contributeAmount').value);
    const res = await fetch(`/api/private/targets/${id}/contribute`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({amount}),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Could not add contribution.');
        return;
    }
    contributeModal.hide();
    await loadTargets();
});
