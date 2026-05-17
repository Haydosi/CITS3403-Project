/**
 * Leaderboard page logic.
 *
 * - Global tab: full ranking (top 50 from API), podium for 1-3 plus
 *   table for 4-N. "Your rank" pinned row when the user isn't visible.
 * - Group tab: per-group ranking. Group is chosen via a dropdown when
 *   the user belongs to more than one group; the choice persists to
 *   localStorage.
 * - Timeframe switcher (?window=week|month|all) applies to both tabs.
 */

const $ = (id) => document.getElementById(id);

const podiumWrap = $("podiumWrap");
const globalTableBody = $("globalTableBody");
const globalRangeBadge = $("globalRangeBadge");
const yourRankRow = $("yourRankRow");
const yourRankValue = $("yourRankValue");

const groupTableBody = $("groupTableBody");
const groupCount = $("groupCount");
const groupTitle = $("groupTitle");
const groupEmpty = $("groupEmpty");
const groupTableWrap = $("groupTableWrap");
const groupPicker = $("groupPicker");
const groupPickerWrap = $("groupPickerWrap");

const worldSection = $("worldSection");
const groupSection = $("groupSection");
const worldTabBtn = $("worldTabBtn");
const groupTabBtn = $("groupTabBtn");
const lbUpdated = $("lbUpdated");
const lbUpdatedLabel = lbUpdated?.querySelector("span");

const windowBtns = document.querySelectorAll(".lb-window-tab");

const STORAGE_GROUP_KEY = "lb.selectedGroupId";
const STORAGE_WINDOW_KEY = "lb.window";
const STORAGE_SCOPE_KEY = "lb.scope";

const WINDOW_LABEL = { all: "All time", month: "This month", week: "This week" };

let activeScope = localStorage.getItem(STORAGE_SCOPE_KEY) || "global";
let activeWindow = localStorage.getItem(STORAGE_WINDOW_KEY) || "all";
let myGroups = [];
let selectedGroupId = null;
let globalRows = [];
let groupRows = [];
let lastFetched = null;

function currency(amount) {
    return `$${Number(amount || 0).toLocaleString("en-AU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
}

function getCurrentUserId() {
    const el = document.querySelector("[data-user-id]");
    return el ? parseInt(el.getAttribute("data-user-id"), 10) : null;
}

function displayName(p) {
    return p.username || "Anonymous";
}

function initials(p) {
    return displayName(p).substring(0, 2).toUpperCase();
}

function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
}

// ─── Rendering ──────────────────────────────────────────────

function renderPodium(rows) {
    const top = rows.slice(0, 3);
    const order = [1, 0, 2]; // 2nd, 1st, 3rd visual order
    podiumWrap.innerHTML = "";
    if (!top.length) {
        podiumWrap.innerHTML =
            '<div class="dash-card text-center text-muted" style="grid-column: 1 / -1;">No savers yet — be the first.</div>';
        return;
    }
    const leaderAmount = top[0].total_saved || 0;
    const myId = getCurrentUserId();
    const icons = ["bi-trophy-fill", "bi-award-fill", "bi-award"];

    for (const visIdx of order) {
        const p = top[visIdx];
        if (!p) {
            podiumWrap.appendChild(document.createElement("div"));
            continue;
        }
        const rank = visIdx + 1;
        const delta =
            rank === 1
                ? "Leading"
                : leaderAmount > 0
                  ? `–${currency(leaderAmount - (p.total_saved || 0))} vs leader`
                  : "";
        const isMe = myId === p.id;
        const card = document.createElement("div");
        card.className = `lb-podium-card rank-${rank}${isMe ? " leaderboard-me" : ""}`;
        card.innerHTML = `
            <div class="lb-rank-badge"><i class="bi ${icons[visIdx]} lb-rank-icon"></i>${rank}</div>
            <div class="lb-avatar">${escapeHtml(initials(p))}</div>
            <div class="lb-name">${escapeHtml(displayName(p))}${isMe ? ' <span class="text-muted small">(you)</span>' : ""}</div>
            <div class="lb-amount">${currency(p.total_saved)}</div>
            <div class="lb-delta">${delta}</div>
        `;
        podiumWrap.appendChild(card);
    }
}

function renderGlobalTable(rows) {
    globalRangeBadge.textContent = WINDOW_LABEL[activeWindow] || "All time";
    globalTableBody.innerHTML = "";
    const myId = getCurrentUserId();
    const leaderAmount = rows[0]?.total_saved || 0;

    const visibleRows = rows.slice(3, 10); // ranks 4-10
    let myRank = rows.findIndex((r) => r.id === myId);
    if (myRank >= 0) myRank += 1;

    visibleRows.forEach((p, i) => {
        const rank = i + 4;
        const isMe = p.id === myId;
        const delta = leaderAmount > 0 ? `–${currency(leaderAmount - (p.total_saved || 0))}` : "—";
        const tr = document.createElement("tr");
        if (isMe) tr.classList.add("leaderboard-me");
        tr.innerHTML = `
            <td class="lb-rank-cell">#${rank}</td>
            <td>
                <div class="leader-name-wrap">
                    <div class="user-avatar">${escapeHtml(initials(p))}</div>
                    <div>${escapeHtml(displayName(p))}${isMe ? ' <span class="text-muted small">(you)</span>' : ""}</div>
                </div>
            </td>
            <td class="text-end lb-amount-cell">${currency(p.total_saved)}</td>
            <td class="text-end lb-delta-cell">${delta}</td>
        `;
        globalTableBody.appendChild(tr);
    });

    if (!visibleRows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="4" class="text-center text-muted py-4">Only the top three so far — climb the ranks!</td>';
        globalTableBody.appendChild(tr);
    }

    // "Your rank" pinned row when user is outside the visible range.
    if (myRank > 10) {
        yourRankRow.classList.remove("d-none");
        const me = rows[myRank - 1];
        yourRankValue.innerHTML = `#${myRank} · ${currency(me.total_saved)}`;
    } else if (myRank === -1 || myRank === 0) {
        yourRankRow.classList.remove("d-none");
        yourRankValue.textContent = "Unranked — log a transaction to enter the board";
    } else {
        yourRankRow.classList.add("d-none");
    }
}

function renderGroupTable(rows) {
    groupTableBody.innerHTML = "";
    const myId = getCurrentUserId();
    const groupTotal = rows.reduce((s, r) => s + (r.total_saved || 0), 0);

    if (!rows.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="4" class="text-center text-muted py-4">No contributions yet in this group.</td>';
        groupTableBody.appendChild(tr);
        return;
    }

    rows.forEach((p, i) => {
        const rank = i + 1;
        const share = groupTotal > 0 ? ((p.total_saved || 0) / groupTotal) * 100 : 0;
        const isMe = p.id === myId;
        const tr = document.createElement("tr");
        if (isMe) tr.classList.add("leaderboard-me");
        const rankLabel = rank <= 3
            ? `<i class="bi ${rank === 1 ? "bi-trophy-fill" : "bi-award-fill"}" style="color: ${rank === 1 ? "#f5c945" : rank === 2 ? "#c9d2dc" : "#d99e6c"}"></i> #${rank}`
            : `#${rank}`;
        tr.innerHTML = `
            <td class="lb-rank-cell">${rankLabel}</td>
            <td>
                <div class="leader-name-wrap">
                    <div class="user-avatar">${escapeHtml(initials(p))}</div>
                    <div>${escapeHtml(displayName(p))}${isMe ? ' <span class="text-muted small">(you)</span>' : ""}</div>
                </div>
            </td>
            <td class="text-end lb-amount-cell">${currency(p.total_saved)}</td>
            <td class="text-end lb-delta-cell">${share.toFixed(1)}%</td>
        `;
        groupTableBody.appendChild(tr);
    });
}

function renderGroupSection() {
    if (!myGroups.length) {
        groupEmpty.classList.remove("d-none");
        groupTableWrap.classList.add("d-none");
        groupPickerWrap.classList.add("d-none");
        groupCount.textContent = "0 members";
        groupTitle.textContent = "Group savings";
        return;
    }
    groupEmpty.classList.add("d-none");
    groupTableWrap.classList.remove("d-none");

    if (myGroups.length > 1) {
        groupPickerWrap.classList.remove("d-none");
    } else {
        groupPickerWrap.classList.add("d-none");
    }
    const selected = myGroups.find((g) => g.id === selectedGroupId) || myGroups[0];
    groupTitle.textContent = selected ? selected.group_name : "Group savings";
    groupCount.textContent = `${groupRows.length} member${groupRows.length === 1 ? "" : "s"}`;
    renderGroupTable(groupRows);
}

// ─── View switching ────────────────────────────────────────

function updateScopeView() {
    const showGlobal = activeScope === "global";
    worldSection.classList.toggle("hidden-section", !showGlobal);
    groupSection.classList.toggle("hidden-section", showGlobal);
    worldTabBtn.classList.toggle("active", showGlobal);
    groupTabBtn.classList.toggle("active", !showGlobal);
    worldTabBtn.setAttribute("aria-selected", String(showGlobal));
    groupTabBtn.setAttribute("aria-selected", String(!showGlobal));
}

function updateWindowView() {
    windowBtns.forEach((b) => b.classList.toggle("active", b.dataset.window === activeWindow));
}

function updateLastFetchedLabel() {
    if (!lbUpdatedLabel) return;
    if (!lastFetched) {
        lbUpdatedLabel.textContent = "Loading…";
        return;
    }
    const seconds = Math.floor((Date.now() - lastFetched) / 1000);
    if (seconds < 5) lbUpdatedLabel.textContent = "Just now";
    else if (seconds < 60) lbUpdatedLabel.textContent = `Updated ${seconds}s ago`;
    else lbUpdatedLabel.textContent = `Updated ${Math.floor(seconds / 60)}m ago`;
}

// ─── Data fetching ─────────────────────────────────────────

async function fetchGroups() {
    try {
        const res = await fetch("/api/private/me/groups?leaderboard=1");
        if (!res.ok) return;
        const data = await res.json();
        myGroups = data.groups || [];
        if (!myGroups.length) {
            selectedGroupId = null;
        } else {
            const stored = parseInt(localStorage.getItem(STORAGE_GROUP_KEY), 10);
            if (myGroups.some((g) => g.id === stored)) {
                selectedGroupId = stored;
            } else {
                selectedGroupId = myGroups[0].id;
            }
        }
        groupPicker.innerHTML = "";
        myGroups.forEach((g) => {
            const opt = document.createElement("option");
            opt.value = String(g.id);
            opt.textContent = g.group_name;
            if (g.id === selectedGroupId) opt.selected = true;
            groupPicker.appendChild(opt);
        });
    } catch (_) {
        myGroups = [];
        selectedGroupId = null;
    }
}

async function fetchGlobal() {
    const res = await fetch(`/api/private/leaderboard?window=${encodeURIComponent(activeWindow)}`);
    if (!res.ok) {
        globalRows = [];
        return;
    }
    const data = await res.json();
    globalRows = data.leaderboard || [];
}

async function fetchGroup() {
    if (selectedGroupId == null) {
        groupRows = [];
        return;
    }
    const res = await fetch(
        `/api/private/leaderboard/group/${selectedGroupId}?window=${encodeURIComponent(activeWindow)}`,
    );
    if (!res.ok) {
        groupRows = [];
        return;
    }
    const data = await res.json();
    groupRows = data.leaderboard || [];
}

async function refresh({ refetchGroups = false } = {}) {
    if (refetchGroups) await fetchGroups();
    await Promise.all([fetchGlobal(), fetchGroup()]);
    lastFetched = Date.now();
    renderPodium(globalRows);
    renderGlobalTable(globalRows);
    renderGroupSection();
    updateLastFetchedLabel();
}

// ─── Event wiring ──────────────────────────────────────────

worldTabBtn.addEventListener("click", () => {
    activeScope = "global";
    localStorage.setItem(STORAGE_SCOPE_KEY, activeScope);
    updateScopeView();
});

groupTabBtn.addEventListener("click", () => {
    activeScope = "group";
    localStorage.setItem(STORAGE_SCOPE_KEY, activeScope);
    updateScopeView();
});

windowBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const w = btn.dataset.window;
        if (!w || w === activeWindow) return;
        activeWindow = w;
        localStorage.setItem(STORAGE_WINDOW_KEY, activeWindow);
        updateWindowView();
        refresh();
    });
});

groupPicker.addEventListener("change", () => {
    selectedGroupId = parseInt(groupPicker.value, 10);
    localStorage.setItem(STORAGE_GROUP_KEY, String(selectedGroupId));
    fetchGroup().then(() => {
        renderGroupSection();
        updateLastFetchedLabel();
    });
});

// Auto-refresh every 5 minutes (and on tab focus). Updates "last
// fetched" label every 10s so it stays accurate.
const REFRESH_MS = 5 * 60 * 1000;
let refreshing = false;
async function backgroundRefresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
        await refresh();
    } finally {
        refreshing = false;
    }
}

setInterval(backgroundRefresh, REFRESH_MS);
setInterval(updateLastFetchedLabel, 10 * 1000);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) backgroundRefresh();
});

updateScopeView();
updateWindowView();
refresh({ refetchGroups: true });
