/**
 * Groups page: /api/private/groups + /api/private/groups/<id>/activity
 */

const groupsList = document.getElementById("groupsList");
const groupsAlert = document.getElementById("groupsAlert");
const openCreateGroup = document.getElementById("openCreateGroup");
const createGroupModal = document.getElementById("createGroupModal");
const newGroupName = document.getElementById("newGroupName");
const createGroupSave = document.getElementById("createGroupSave");
const inviteModal = document.getElementById("inviteModal");
const inviteGroupId = document.getElementById("inviteGroupId");
const inviteEmail = document.getElementById("inviteEmail");
const inviteSave = document.getElementById("inviteSave");
const renameModal = document.getElementById("renameModal");
const renameGroupId = document.getElementById("renameGroupId");
const renameGroupName = document.getElementById("renameGroupName");
const renameSave = document.getElementById("renameSave");

const addTxnModal = document.getElementById("addTxnModal");
const addTxnGroupId = document.getElementById("addTxnGroupId");
const addTxnAmount = document.getElementById("addTxnAmount");
const addTxnDesc = document.getElementById("addTxnDesc");
const addTxnCategory = document.getElementById("addTxnCategory");
const addTxnCategoryWrap = document.getElementById("addTxnCategoryWrap");
const addTxnSave = document.getElementById("addTxnSave");
const addTxnError = document.getElementById("addTxnError");

const CATEGORY_CONFIG = {
    food:          { color: "#f59e0b", label: "Food" },
    groceries:     { color: "#84cc16", label: "Groceries" },
    transport:     { color: "#3b82f6", label: "Transport" },
    housing:       { color: "#8b5cf6", label: "Housing" },
    utilities:     { color: "#06b6d4", label: "Utilities" },
    entertainment: { color: "#ec4899", label: "Entertainment" },
    health:        { color: "#ef4444", label: "Health" },
    shopping:      { color: "#f43f5e", label: "Shopping" },
    other:         { color: "#64748b", label: "Other" },
};
function categoryConf(c) {
    return CATEGORY_CONFIG[c] || CATEGORY_CONFIG.other;
}

const breakdownCharts = new Map();
const recentTxnControllers = new Map(); // per-group AbortControllers

function formatRelativeTime(iso) {
    if (!iso) return "";
    const then = new Date(iso);
    const diff = (Date.now() - then.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return then.toLocaleDateString();
}

function signedCurrency(amount, sign) {
    const prefix = sign === "+" ? "+" : sign === "-" ? "−" : "";
    return `${prefix}${currency(Math.abs(amount))}`;
}

let createModal;
let inviteModalInst;
let renameModalInst;
let cachedGroups = [];
const activityCharts = new Map();

function showErr(msg) {
    groupsAlert.textContent = msg;
    groupsAlert.classList.remove("d-none");
}

function clearErr() {
    groupsAlert.classList.add("d-none");
    groupsAlert.textContent = "";
}

function canInvite(role) {
    return role === "owner" || role === "admin";
}

function canRename(role) {
    return role === "owner" || role === "admin";
}

function displayName(m) {
    if (m.first_name || m.last_name) {
        return `${m.first_name || ""} ${m.last_name || ""}`.trim();
    }
    return m.username || m.email || "Member";
}

function initials(m) {
    const name = displayName(m) || "?";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function currency(amount) {
    return `$${Number(amount || 0).toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
}

function statStrip(g) {
    const top = g.top_contributor;
    const topName = top ? escapeHtml(displayName(top)) : "—";
    const topInitials = top ? escapeHtml(initials(top)) : "··";
    const net = Number(g.net_balance || 0);
    const netClass = net < 0 ? "negative" : "positive";
    return `
        <div class="grp-stats">
            <div class="grp-stat accent ${netClass}">
                <span class="grp-stat-label">Net balance</span>
                <span class="grp-stat-value">${currency(net)}</span>
            </div>
            <div class="grp-stat">
                <span class="grp-stat-label">Total saved</span>
                <span class="grp-stat-value">${currency(g.total_saved)}</span>
            </div>
            <div class="grp-stat">
                <span class="grp-stat-label">Total spent</span>
                <span class="grp-stat-value">${currency(g.total_spent)}</span>
            </div>
            <div class="grp-stat">
                <span class="grp-stat-label">Members</span>
                <span class="grp-stat-value">${g.member_count || 0}</span>
            </div>
            <div class="grp-stat">
                <span class="grp-stat-label">Top contributor</span>
                <span class="grp-stat-sub">
                    <span class="user-avatar">${topInitials}</span>
                    <span class="text-truncate">${topName}</span>
                </span>
            </div>
        </div>
    `;
}

function memberRows(g, myRole) {
    return (g.members || [])
        .map((m) => {
            const isMe = document.body.getAttribute("data-user-id") === String(m.id);
            const removeOthers =
                canInvite(myRole) &&
                !isMe &&
                (myRole === "owner" || (myRole === "admin" && m.user_role === "member"));
            const removeSelf = isMe;
            const sharePct = Number(m.share_pct || 0);

            let actionsHtml = "";
            if (removeOthers || removeSelf) {
                actionsHtml = `
                    <div class="dropdown grp-row-menu">
                        <button type="button" class="btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Member actions">
                            <i class="bi bi-three-dots"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><button type="button" class="dropdown-item text-danger grp-remove" data-gid="${g.id}" data-uid="${m.id}">
                                <i class="bi bi-${removeSelf ? "box-arrow-right" : "person-dash"} me-2"></i>${removeSelf ? "Leave group" : "Remove member"}
                            </button></li>
                        </ul>
                    </div>`;
            }

            return `
                <tr${isMe ? ' class="leaderboard-me"' : ""}>
                    <td>
                        <div class="leader-name-wrap">
                            <div class="user-avatar">${escapeHtml(initials(m))}</div>
                            <div>
                                <div>${escapeHtml(displayName(m))}${isMe ? ' <span class="text-muted small">(you)</span>' : ""}</div>
                                <div class="text-secondary small">${escapeHtml(m.email || "")}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="grp-role-pill">${escapeHtml(m.user_role || "")}</span></td>
                    <td>
                        <div class="grp-member-saved">${currency(m.total_saved)}</div>
                        <div class="grp-member-share">${sharePct.toFixed(1)}% of group</div>
                        <div class="grp-share-bar"><div class="grp-share-fill" style="width: ${Math.min(sharePct, 100)}%"></div></div>
                    </td>
                    <td class="text-end">${actionsHtml}</td>
                </tr>`;
        })
        .join("");
}

function render() {
    activityCharts.forEach((c) => c.destroy());
    activityCharts.clear();
    breakdownCharts.forEach((c) => c.destroy());
    breakdownCharts.clear();
    recentTxnControllers.forEach((c) => c.abort());
    recentTxnControllers.clear();

    if (!cachedGroups.length) {
        groupsList.innerHTML = `
            <div class="grp-empty anim-in">
                <div class="grp-empty-icon"><i class="bi bi-people-fill"></i></div>
                <h3>Save together</h3>
                <p>You're not in any group yet. Create one to pool savings with family or friends and see who's pulling ahead.</p>
                <button type="button" class="btn btn-accent" id="emptyCreateGroup">
                    <i class="bi bi-plus-lg"></i> Create your first group
                </button>
            </div>`;
        const emptyBtn = document.getElementById("emptyCreateGroup");
        if (emptyBtn) emptyBtn.addEventListener("click", openCreateGroupModal);
        return;
    }

    groupsList.innerHTML = "";
    cachedGroups.forEach((g) => {
        const myRole = g.my_role || "member";
        const card = document.createElement("section");
        card.className = "grp-card anim-in";
        card.setAttribute("data-group-id", String(g.id));
        const inviteBtn = canInvite(myRole)
            ? `<button type="button" class="btn btn-sm btn-accent grp-invite" data-id="${g.id}"><i class="bi bi-person-plus me-1"></i>Invite</button>`
            : "";
        const renameBtn = canRename(myRole)
            ? `<button type="button" class="btn btn-sm btn-outline-light grp-rename" data-id="${g.id}"><i class="bi bi-pencil me-1"></i>Rename</button>`
            : "";
        const addTxnBtn = `<button type="button" class="btn btn-sm btn-accent grp-add-txn" data-id="${g.id}"><i class="bi bi-plus-lg me-1"></i>Add transaction</button>`;
        const lbEnabled = g.leaderboard_enabled !== false;
        const leaderboardToggle = canRename(myRole)
            ? `<div class="form-check form-switch grp-leaderboard-switch mb-0">
                <input class="form-check-input grp-leaderboard-toggle" type="checkbox" role="switch"
                    id="grpLb-${g.id}" data-id="${g.id}" ${lbEnabled ? "checked" : ""}
                    aria-label="Show ${escapeHtml(g.group_name)} on leaderboard">
                <label class="form-check-label" for="grpLb-${g.id}">Show on leaderboard</label>
               </div>`
            : `<span class="grp-leaderboard-status ${lbEnabled ? "on" : "off"}">${lbEnabled ? "On leaderboard" : "Hidden from leaderboard"}</span>`;

        card.innerHTML = `
            <div class="grp-card-head">
                <div style="min-width: 0;">
                    <h3 class="grp-title">${escapeHtml(g.group_name)}</h3>
                    <div class="grp-meta">You are <strong>${escapeHtml(myRole)}</strong> · ${g.member_count || 0} member${g.member_count === 1 ? "" : "s"}</div>
                </div>
                <div class="grp-actions">
                    ${renameBtn}
                    ${inviteBtn}
                    ${addTxnBtn}
                </div>
            </div>
            <div class="grp-settings">
                ${leaderboardToggle}
            </div>
            <div class="grp-body">
                ${statStrip(g)}
                <div class="grp-chart-row">
                    <div class="grp-chart-wrap">
                        <div class="grp-chart-head">
                            <span class="grp-chart-title">Last 30 days</span>
                            <span class="grp-chart-sub" id="chartTotal-${g.id}"></span>
                        </div>
                        <canvas id="chart-${g.id}"></canvas>
                    </div>
                    <div class="grp-breakdown-wrap">
                        <div class="grp-chart-head">
                            <span class="grp-chart-title">Expenses by category</span>
                            <span class="grp-chart-sub">${currency(g.total_spent)}</span>
                        </div>
                        <div class="grp-breakdown-inner">
                            <canvas id="breakdown-${g.id}"></canvas>
                            <div class="grp-breakdown-empty d-none" id="breakdownEmpty-${g.id}">
                                No expenses yet.
                            </div>
                        </div>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="txn-table leaderboard-table">
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>Role</th>
                                <th>Contributed</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${memberRows(g, myRole)}</tbody>
                    </table>
                </div>
                <div class="grp-recent-wrap">
                    <div class="grp-chart-head">
                        <span class="grp-chart-title">Recent group transactions</span>
                        <span class="grp-chart-sub">Latest 50</span>
                    </div>
                    <div class="table-responsive">
                        <table class="txn-table">
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th>Category</th>
                                    <th>When</th>
                                </tr>
                            </thead>
                            <tbody id="recent-${g.id}">
                                <tr><td colspan="6" class="text-secondary small">Loading…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        groupsList.appendChild(card);

        loadActivityChart(g.id);
        renderBreakdownChart(g);
        loadRecentTransactions(g.id);
    });

    groupsList.querySelectorAll(".grp-invite").forEach((btn) => {
        btn.addEventListener("click", () => {
            inviteGroupId.value = btn.getAttribute("data-id");
            inviteEmail.value = "";
            clearErr();
            inviteModalInst.show();
        });
    });

    groupsList.querySelectorAll(".grp-rename").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.getAttribute("data-id"), 10);
            const g = cachedGroups.find((x) => x.id === id);
            renameGroupId.value = String(id);
            renameGroupName.value = g ? g.group_name : "";
            clearErr();
            renameModalInst.show();
        });
    });

    groupsList.querySelectorAll(".grp-add-txn").forEach((btn) => {
        btn.addEventListener("click", () => {
            openAddTxnModal(btn.getAttribute("data-id"));
        });
    });

    groupsList.querySelectorAll(".grp-leaderboard-toggle").forEach((input) => {
        input.addEventListener("change", async () => {
            const gid = input.getAttribute("data-id");
            const enabled = input.checked;
            clearErr();
            const res = await fetch(`/api/private/groups/${gid}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leaderboard_enabled: enabled }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showErr(err.error || "Could not update leaderboard setting.");
                input.checked = !enabled;
                return;
            }
            await loadGroups();
        });
    });

    groupsList.querySelectorAll(".grp-remove").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const gid = btn.getAttribute("data-gid");
            const uid = btn.getAttribute("data-uid");
            const self = uid === document.body.getAttribute("data-user-id");
            if (!self && !window.confirm("Remove this member from the group?")) return;
            if (self && !window.confirm("Leave this group?")) return;
            clearErr();
            const res = await fetch(`/api/private/groups/${gid}/members/${uid}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showErr(err.error || "Could not update membership.");
                return;
            }
            await loadGroups();
        });
    });
}

async function loadActivityChart(groupId) {
    const canvas = document.getElementById(`chart-${groupId}`);
    const totalEl = document.getElementById(`chartTotal-${groupId}`);
    if (!canvas) return;
    try {
        const res = await fetch(`/api/private/groups/${groupId}/activity`);
        if (!res.ok) return;
        const data = await res.json();
        const series = data.series || [];
        const labels = series.map((p) => p.date);
        const saved = series.map((p) => p.saved || 0);
        const spent = series.map((p) => p.spent || 0);
        const totalSaved = saved.reduce((s, v) => s + v, 0);
        const totalSpent = spent.reduce((s, v) => s + v, 0);
        if (totalEl) {
            totalEl.textContent = `+${currency(totalSaved)} added · −${currency(totalSpent)} spent`;
        }

        const ctx = canvas.getContext("2d");
        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Saved",
                        data: saved,
                        backgroundColor: "rgba(45, 212, 168, 0.85)",
                        borderColor: "#2dd4a8",
                        borderWidth: 1,
                        borderRadius: 3,
                        maxBarThickness: 6,
                    },
                    {
                        label: "Spent",
                        data: spent,
                        backgroundColor: "rgba(239, 68, 68, 0.85)",
                        borderColor: "#ef4444",
                        borderWidth: 1,
                        borderRadius: 3,
                        maxBarThickness: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${currency(ctx.parsed.y)}`,
                        },
                    },
                },
                scales: {
                    x: { display: false, grid: { display: false } },
                    y: { display: false, grid: { display: false }, beginAtZero: true },
                },
            },
        });
        activityCharts.set(groupId, chart);
    } catch (_) {
        // Chart is decorative; failure is non-fatal.
    }
}

function renderBreakdownChart(g) {
    const canvas = document.getElementById(`breakdown-${g.id}`);
    const emptyEl = document.getElementById(`breakdownEmpty-${g.id}`);
    if (!canvas) return;
    const breakdown = g.expense_breakdown || [];
    if (!breakdown.length) {
        canvas.classList.add("d-none");
        if (emptyEl) emptyEl.classList.remove("d-none");
        return;
    }
    canvas.classList.remove("d-none");
    if (emptyEl) emptyEl.classList.add("d-none");

    const labels = breakdown.map((e) => categoryConf(e.category).label);
    const amounts = breakdown.map((e) => Math.abs(Number(e.amount) || 0));
    const colors = breakdown.map((e) => categoryConf(e.category).color);

    const ctx = canvas.getContext("2d");
    const chart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: amounts,
                backgroundColor: colors,
                borderColor: "transparent",
                hoverOffset: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: {
                legend: { display: true, position: "bottom", labels: { boxWidth: 10, color: "#cbd5e1" } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${currency(ctx.parsed)}`,
                    },
                },
            },
        },
    });
    breakdownCharts.set(g.id, chart);
}

async function loadRecentTransactions(groupId) {
    const tbody = document.getElementById(`recent-${groupId}`);
    if (!tbody) return;
    if (recentTxnControllers.has(groupId)) {
        recentTxnControllers.get(groupId).abort();
    }
    const controller = new AbortController();
    recentTxnControllers.set(groupId, controller);

    try {
        const res = await fetch(`/api/private/groups/${groupId}/transactions`, { signal: controller.signal });
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-secondary small">Could not load transactions.</td></tr>`;
            return;
        }
        const data = await res.json();
        const txns = data.transactions || [];
        if (!txns.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-secondary small">No transactions yet.</td></tr>`;
            return;
        }
        tbody.innerHTML = txns.map((t) => {
            const u = t.user || {};
            const name = displayName(u);
            const type = t.transaction_type;
            const sign = type === "expense" ? "-" : "+";
            const typeLabel = type === "expense" ? "Spend" : type === "savings" ? "Add" : type;
            const cat = t.category ? categoryConf(t.category).label : "—";
            return `
                <tr>
                    <td>
                        <div class="leader-name-wrap">
                            <div class="user-avatar">${escapeHtml(initials(u))}</div>
                            <div>${escapeHtml(name)}</div>
                        </div>
                    </td>
                    <td><span class="grp-role-pill">${escapeHtml(typeLabel)}</span></td>
                    <td>${signedCurrency(t.amount, sign)}</td>
                    <td>${escapeHtml(t.description || "")}</td>
                    <td>${escapeHtml(cat)}</td>
                    <td class="text-secondary small">${escapeHtml(formatRelativeTime(t.created_at))}</td>
                </tr>`;
        }).join("");
    } catch (err) {
        if (err.name === "AbortError") return;
        tbody.innerHTML = `<tr><td colspan="6" class="text-secondary small">Could not load transactions.</td></tr>`;
    }
}

async function loadGroups() {
    clearErr();
    const res = await fetch("/api/private/groups");
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showErr(err.error || "Could not load groups.");
        return;
    }
    const data = await res.json();
    cachedGroups = data.groups || [];
    render();
}

function openCreateGroupModal() {
    newGroupName.value = "";
    clearErr();
    createModal.show();
}

openCreateGroup.addEventListener("click", openCreateGroupModal);

let addTxnModalInst;

function openAddTxnModal(groupId) {
    addTxnGroupId.value = String(groupId);
    addTxnAmount.value = "";
    addTxnDesc.value = "";
    addTxnCategory.value = "food";
    addTxnError.classList.add("d-none");
    addTxnError.textContent = "";
    const savingsRadio = document.getElementById("addTxnTypeSavings");
    savingsRadio.checked = true;
    addTxnCategoryWrap.classList.add("d-none");
    addTxnModalInst.show();
}

document.querySelectorAll('input[name="addTxnType"]').forEach((radio) => {
    radio.addEventListener("change", () => {
        const isExpense = document.getElementById("addTxnTypeExpense").checked;
        addTxnCategoryWrap.classList.toggle("d-none", !isExpense);
    });
});

addTxnSave.addEventListener("click", async () => {
    const gid = parseInt(addTxnGroupId.value, 10);
    const amount = parseFloat(addTxnAmount.value);
    if (!gid || !Number.isFinite(amount) || amount <= 0) {
        addTxnError.textContent = "Enter an amount greater than 0.";
        addTxnError.classList.remove("d-none");
        return;
    }
    const isExpense = document.getElementById("addTxnTypeExpense").checked;
    const body = {
        amount,
        group_id: gid,
        transaction_type: isExpense ? "expense" : "savings",
    };
    const desc = addTxnDesc.value.trim();
    if (desc) body.description = desc;
    if (isExpense) body.category = addTxnCategory.value;

    addTxnError.classList.add("d-none");
    const res = await fetch("/api/private/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addTxnError.textContent = err.error || "Could not save.";
        addTxnError.classList.remove("d-none");
        return;
    }
    addTxnModalInst.hide();
    await loadGroups();
});

createGroupSave.addEventListener("click", async () => {
    const name = newGroupName.value.trim();
    if (!name) {
        showErr("Enter a group name.");
        return;
    }
    clearErr();
    const res = await fetch("/api/private/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_name: name }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showErr(err.error || "Could not create group.");
        return;
    }
    createModal.hide();
    await loadGroups();
});

inviteSave.addEventListener("click", async () => {
    const gid = inviteGroupId.value;
    const email = inviteEmail.value.trim().toLowerCase();
    if (!email) {
        showErr("Enter an email address.");
        return;
    }
    clearErr();
    const res = await fetch(`/api/private/groups/${gid}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showErr(err.error || "Invite failed.");
        return;
    }
    inviteModalInst.hide();
    await loadGroups();
});

renameSave.addEventListener("click", async () => {
    const gid = renameGroupId.value;
    const name = renameGroupName.value.trim();
    if (!name) {
        showErr("Enter a name.");
        return;
    }
    clearErr();
    const res = await fetch(`/api/private/groups/${gid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_name: name }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showErr(err.error || "Rename failed.");
        return;
    }
    renameModalInst.hide();
    await loadGroups();
});

if (createGroupModal) createModal = new bootstrap.Modal(createGroupModal);
if (inviteModal) inviteModalInst = new bootstrap.Modal(inviteModal);
if (renameModal) renameModalInst = new bootstrap.Modal(renameModal);
if (addTxnModal) addTxnModalInst = new bootstrap.Modal(addTxnModal);

loadGroups();
