// ─── Mock Data ───────────────────────────────────────────────
// Placeholder data — replace with real API responses when the backend is ready.

const EXPENSES = [
    {category: 'Dining', amount: 620, color: '#f43f5e', icon: 'bi-cup-hot'},
    {category: 'Groceries', amount: 480, color: '#f59e0b', icon: 'bi-basket'},
    {category: 'Transport', amount: 350, color: '#3b82f6', icon: 'bi-bus-front'},
    {category: 'Utilities', amount: 290, color: '#8b5cf6', icon: 'bi-lightning'},
    {category: 'Entertainment', amount: 410, color: '#06b6d4', icon: 'bi-controller'},
    {category: 'Shopping', amount: 520, color: '#ec4899', icon: 'bi-bag'},
    {category: 'Health', amount: 280, color: '#10b981', icon: 'bi-heart-pulse'},
    {category: 'Other', amount: 470, color: '#64748b', icon: 'bi-three-dots'},
];

const TRANSACTIONS = [
    {date: '2026-04-14', category: 'Dining', desc: 'Sushi World', amount: -42.50, color: '#f43f5e'},
    {date: '2026-04-13', category: 'Transport', desc: 'Uber to Campus', amount: -18.00, color: '#3b82f6'},
    {date: '2026-04-13', category: 'Groceries', desc: 'Woolworths', amount: -67.30, color: '#f59e0b'},
    {date: '2026-04-12', category: 'Entertainment', desc: 'Spotify Premium', amount: -12.99, color: '#06b6d4'},
    {date: '2026-04-12', category: 'Shopping', desc: 'Amazon — USB-C Hub', amount: -35.00, color: '#ec4899'},
    {date: '2026-04-11', category: 'Utilities', desc: 'Electricity Bill', amount: -142.00, color: '#8b5cf6'},
    {date: '2026-04-10', category: 'Health', desc: 'Pharmacy', amount: -24.50, color: '#10b981'},
];

// ─── Expense Donut Chart ─────────────────────────────────────
const ctx = document.getElementById('expenseDonut').getContext('2d');
new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: EXPENSES.map(e => e.category),
        datasets: [{
            data: EXPENSES.map(e => e.amount),
            backgroundColor: EXPENSES.map(e => e.color),
            borderColor: 'transparent',
            borderWidth: 0,
            hoverBorderColor: '#fff',
            hoverBorderWidth: 2,
            spacing: 3,
            borderRadius: 4,
        }]
    },
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
                callbacks: {
                    label: (ctx) => ` $${ctx.parsed.toLocaleString()}`
                }
            }
        },
        animation: {
            animateRotate: true,
            duration: 1200,
            easing: 'easeOutQuart',
        }
    }
});

const legendEl = document.getElementById('chartLegend');
EXPENSES.forEach(e => {
    legendEl.innerHTML += `
    <div class="legend-item">
        <span class="legend-dot" style="background:${e.color}"></span>
        ${e.category}
        <span class="legend-amount">$${e.amount}</span>
    </div>`;
});

// ─── Transactions ────────────────────────────────────────────
// Category pill colour uses t.color with 20 (hex) = 12% opacity background.
const txnBody = document.getElementById('txnBody');
TRANSACTIONS.forEach(t => {
    const isExpense = t.amount < 0;
    const formatted = isExpense
        ? `-$${Math.abs(t.amount).toFixed(2)}`
        : `+$${t.amount.toFixed(2)}`;
    const dateObj = new Date(t.date + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'});
    txnBody.innerHTML += `
    <tr>
        <td class="txn-date">${dateStr}</td>
        <td>
            <span class="txn-category-pill" style="background:${t.color}20; color:${t.color}">
                ${t.category}
            </span>
        </td>
        <td>${t.desc}</td>
        <td class="text-end">
            <span class="txn-amount ${isExpense ? 'expense' : 'income-txn'}">${formatted}</span>
        </td>
    </tr>`;
});

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

