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
    return `
        <div class="grp-stats">
            <div class="grp-stat accent">
                <span class="grp-stat-label">Group total</span>
                <span class="grp-stat-value">${currency(g.total_saved)}</span>
            </div>
            <div class="grp-stat">
                <span class="grp-stat-label">This month</span>
                <span class="grp-stat-value">${currency(g.month_saved)}</span>
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
        const inviteBtn = canInvite(myRole)
            ? `<button type="button" class="btn btn-sm btn-accent grp-invite" data-id="${g.id}"><i class="bi bi-person-plus me-1"></i>Invite</button>`
            : "";
        const renameBtn = canRename(myRole)
            ? `<button type="button" class="btn btn-sm btn-outline-light grp-rename" data-id="${g.id}"><i class="bi bi-pencil me-1"></i>Rename</button>`
            : "";

        card.innerHTML = `
            <div class="grp-card-head">
                <div style="min-width: 0;">
                    <h3 class="grp-title">${escapeHtml(g.group_name)}</h3>
                    <div class="grp-meta">You are <strong>${escapeHtml(myRole)}</strong> · ${g.member_count || 0} member${g.member_count === 1 ? "" : "s"}</div>
                </div>
                <div class="grp-actions">
                    ${renameBtn}
                    ${inviteBtn}
                </div>
            </div>
            <div class="grp-body">
                ${statStrip(g)}
                <div class="grp-chart-wrap">
                    <div class="grp-chart-head">
                        <span class="grp-chart-title">Last 30 days</span>
                        <span class="grp-chart-sub" id="chartTotal-${g.id}"></span>
                    </div>
                    <canvas id="chart-${g.id}"></canvas>
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
            </div>`;
        groupsList.appendChild(card);

        loadActivityChart(g.id);
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
        const amounts = series.map((p) => p.amount);
        const total = amounts.reduce((s, v) => s + v, 0);
        if (totalEl) totalEl.textContent = `${currency(total)} added`;

        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, 0, 90);
        gradient.addColorStop(0, "rgba(45, 212, 168, 0.35)");
        gradient.addColorStop(1, "rgba(45, 212, 168, 0)");

        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        data: amounts,
                        backgroundColor: gradient,
                        borderColor: "#2dd4a8",
                        borderWidth: 1,
                        borderRadius: 3,
                        maxBarThickness: 8,
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
                            label: (ctx) => currency(ctx.parsed.y),
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

loadGroups();
