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

const TARGETS = [
    {name: 'Summer Trip', emoji: '✈️', current: 1400, goal: 2000, status: 'on-track', deadline: '2026-07-01'},
    {name: 'New Laptop', emoji: '💻', current: 820, goal: 1500, status: 'at-risk', deadline: '2026-06-15'},
    {name: 'Emergency Fund', emoji: '🛡️', current: 3200, goal: 5000, status: 'on-track', deadline: '2026-12-31'},
    {name: 'Course Fee', emoji: '🎓', current: 150, goal: 800, status: 'behind', deadline: '2026-05-20'},
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

// ─── Targets ─────────────────────────────────────────────────
// Bars start at width:0 and animate to the real % via setTimeout
// so the CSS transition plays after the element is in the DOM.
const targetsList = document.getElementById('targetsList');
const statusLabel = {'on-track': 'On Track', 'at-risk': 'At Risk', 'behind': 'Behind'};

document.getElementById('targetsCount').textContent = `${TARGETS.length} active`;

TARGETS.forEach(t => {
    const pct = Math.round((t.current / t.goal) * 100);
    targetsList.innerHTML += `
    <div class="target-item">
        <div class="target-header">
            <span class="target-name">
                <span class="target-emoji">${t.emoji}</span>
                ${t.name}
            </span>
            <span class="forecast-badge ${t.status}">${statusLabel[t.status]}</span>
        </div>
        <div class="target-progress-row">
            <div class="target-progress-bar">
                <div class="target-progress-fill ${t.status}" style="width: 0%" data-width="${pct}%"></div>
            </div>
            <span class="target-amounts"><strong>$${t.current.toLocaleString()}</strong> / $${t.goal.toLocaleString()}</span>
        </div>
    </div>`;
});

setTimeout(() => {
    document.querySelectorAll('.target-progress-fill').forEach(bar => {
        bar.style.width = bar.dataset.width;
    });
}, 300);

// ─── Monthly Momentum ───────────────────────────────────────
const onTrack = TARGETS.filter(t => t.status === 'on-track').length;
const atRisk = TARGETS.filter(t => t.status === 'at-risk').length;
const behind = TARGETS.filter(t => t.status === 'behind').length;
const pctAchieved = Math.round((onTrack / TARGETS.length) * 100);

document.getElementById('momentumSet').textContent = TARGETS.length;
document.getElementById('momentumOnTrack').textContent = onTrack;
document.getElementById('momentumAtRisk').textContent = atRisk;
document.getElementById('momentumBehind').textContent = behind;

// Animate the SVG ring arc: circumference = 2πr = 2π×50 ≈ 314
const circumference = 2 * Math.PI * 50;
setTimeout(() => {
    const arc = document.getElementById('momentumArc');
    const dashLen = (pctAchieved / 100) * circumference;
    arc.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
    arc.setAttribute('stroke-dasharray', `${dashLen} ${circumference}`);
    document.getElementById('momentumPct').textContent = `${pctAchieved}%`;
}, 400);

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

// ─── New Target Form ─────────────────────────────────────────
// Uses browser constraint validation before reading values.
// Appends a new row to #targetsList and increments the count badge,
// then resets the form and closes the modal via the Bootstrap Modal API.
document.getElementById('saveTargetBtn').addEventListener('click', () => {
    const form = document.getElementById('newTargetForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    const name = document.getElementById('targetName').value;
    const amount = parseInt(document.getElementById('targetAmount').value);
    const emoji = document.getElementById('targetEmoji').value;

    const targetsList = document.getElementById('targetsList');
    const newItem = document.createElement('div');
    newItem.className = 'target-item';
    newItem.innerHTML = `
    <div class="target-header">
        <span class="target-name">
            <span class="target-emoji">${emoji}</span>
            ${name}
        </span>
        <span class="forecast-badge on-track">On Track</span>
    </div>
    <div class="target-progress-row">
        <div class="target-progress-bar">
            <div class="target-progress-fill on-track" style="width: 0%"></div>
        </div>
        <span class="target-amounts"><strong>$0</strong> / $${amount.toLocaleString()}</span>
    </div>`;
    targetsList.appendChild(newItem);

    const countBadge = document.getElementById('targetsCount');
    const currentCount = parseInt(countBadge.textContent) || TARGETS.length;
    countBadge.textContent = `${currentCount + 1} active`;

    form.reset();
    bootstrap.Modal.getInstance(document.getElementById('newTargetModal')).hide();
});