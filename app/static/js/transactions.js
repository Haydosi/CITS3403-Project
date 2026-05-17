/**
 * Transactions page: list, create, edit, delete via /api/private/transactions
 */

const txnTableBody = document.getElementById("txnTableBody");
const txnGroupTableBody = document.getElementById("txnGroupTableBody");
const txnGroupSection = document.getElementById("txnGroupSection");
const txnTotalBalance = document.getElementById("txnTotalBalance");
const txnListMeta = document.getElementById("txnListMeta");
const txnAlert = document.getElementById("txnAlert");
const txnModal = document.getElementById("txnModal");
const txnModalLabel = document.getElementById("txnModalLabel");
const txnEditId = document.getElementById("txnEditId");
const txnAmount = document.getElementById("txnAmount");
const txnType = document.getElementById("txnType");
const txnCategoryWrap = document.getElementById("txnCategoryWrap");
const txnCategory = document.getElementById("txnCategory");
const txnGroup = document.getElementById("txnGroup");
const txnDescription = document.getElementById("txnDescription");
const txnSaveBtn = document.getElementById("txnSaveBtn");
const openAddTxn = document.getElementById("openAddTxn");

let userGroups = [];
let allLoadedTransactions = [];

// Keep in sync with ALLOWED_EXPENSE_CATEGORIES in app/api.py
const CATEGORY_CONFIG = {
    food: { label: "Food", color: "#f59e0b" },
    groceries: { label: "Groceries", color: "#84cc16" },
    transport: { label: "Transport", color: "#3b82f6" },
    housing: { label: "Housing", color: "#8b5cf6" },
    utilities: { label: "Utilities", color: "#06b6d4" },
    entertainment: { label: "Entertainment", color: "#ec4899" },
    health: { label: "Health", color: "#ef4444" },
    shopping: { label: "Shopping", color: "#f43f5e" },
    other: { label: "Other", color: "#64748b" },
};

function categoryConf(category) {
    if (!category) return { label: "—", color: "#64748b" };
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
}

function formatCategoryCell(row) {
    if ((row.transaction_type || "").toLowerCase() !== "expense") {
        return "—";
    }
    const cat = row.category;
    if (!cat) {
        return '<span class="txn-category-pill txn-category-missing">Uncategorised</span>';
    }
    const conf = categoryConf(cat);
    return `<span class="txn-category-pill" style="background:${conf.color}20;color:${conf.color}">${escapeHtml(conf.label)}</span>`;
}

function updateCategoryVisibility() {
    const isExpense = txnType.value === "expense";
    txnCategoryWrap.classList.toggle("d-none", !isExpense);
    if (!isExpense) txnCategory.value = "";
}

txnType.addEventListener("change", updateCategoryVisibility);

let txnModalInstance = null;

function currency(amount) {
    const n = Number(amount);
    const abs = Math.abs(n);
    const core = `$${abs.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (n < 0) return `−${core}`;
    return core;
}

function showTxnError(msg) {
    if (!txnAlert) return;
    txnAlert.textContent = msg;
    txnAlert.classList.remove("d-none");
}

function clearTxnError() {
    if (!txnAlert) return;
    txnAlert.classList.add("d-none");
    txnAlert.textContent = "";
}

function typeClass(t) {
    const x = (t || "").toLowerCase();
    if (x === "expense") return "txn-type-expense";
    if (x === "transfer") return "txn-type-transfer";
    return "txn-type-savings";
}

function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-AU", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function populateGroupSelect(selectedId) {
    if (!txnGroup) return;
    const sel = selectedId != null && selectedId !== "" ? String(selectedId) : "";
    txnGroup.innerHTML = '<option value="">Personal only</option>';
    userGroups.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = String(g.id);
        opt.textContent = g.group_name;
        if (opt.value === sel) opt.selected = true;
        txnGroup.appendChild(opt);
    });
}

async function loadUserGroups() {
    const res = await fetch("/api/private/me/groups");
    userGroups = res.ok ? (await res.json()).groups || [] : [];
}

function resetModalForAdd() {
    txnEditId.value = "";
    txnModalLabel.textContent = "Add transaction";
    txnAmount.value = "";
    txnType.value = "savings";
    txnCategory.value = "";
    txnDescription.value = "";
    populateGroupSelect("");
    updateCategoryVisibility();
    clearTxnError();
}

function openModalForEdit(row) {
    txnEditId.value = String(row.id);
    txnModalLabel.textContent = "Edit transaction";
    txnAmount.value = row.amount;
    txnType.value = row.transaction_type || "savings";
    txnCategory.value = row.category || "";
    txnDescription.value = row.description || "";
    populateGroupSelect(row.group_id || "");
    updateCategoryVisibility();
    clearTxnError();
    txnModalInstance.show();
}

function bindTableActions(tbody, transactions) {
    tbody.querySelectorAll(".txn-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.getAttribute("data-id"), 10);
            const row = allLoadedTransactions.find((t) => t.id === id);
            if (row) openModalForEdit(row);
        });
    });
    tbody.querySelectorAll(".txn-del").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = parseInt(btn.getAttribute("data-id"), 10);
            if (!Number.isFinite(id) || !window.confirm("Delete this transaction?")) return;
            clearTxnError();
            const res = await fetch(`/api/private/transactions/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showTxnError(err.error || "Could not delete.");
                return;
            }
            await refreshList();
        });
    });
}

function renderRows(tbody, transactions, showGroup) {
    if (!tbody) return;
    tbody.innerHTML = "";
    transactions.forEach((row) => {
        const amt = Number(row.amount);
        const amtClass = amt < 0 ? "txn-amount-neg" : "txn-amount-pos";
        const groupCell = showGroup
            ? `<td><span class="txn-group-pill">${escapeHtml(row.group_name || "—")}</span></td>`
            : "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${formatDate(row.created_at)}</td>
            ${groupCell}
            <td><span class="txn-type-pill ${typeClass(row.transaction_type)}">${row.transaction_type || "—"}</span></td>
            <td>${formatCategoryCell(row)}</td>
            <td>${escapeHtml(row.description || "—")}</td>
            <td class="text-end ${amtClass}">${currency(amt)}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-light me-1 txn-edit" data-id="${row.id}">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger txn-del" data-id="${row.id}">Delete</button>
            </td>`;
        tbody.appendChild(tr);
    });
    bindTableActions(tbody, transactions);
}

function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}

async function refreshList() {
    clearTxnError();
    const res = await fetch("/api/private/transactions");
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showTxnError(err.error || "Could not load transactions.");
        return;
    }
    const data = await res.json();
    const personal = data.transactions || [];
    const group = data.group_transactions || [];
    allLoadedTransactions = personal.concat(group);
    const total = data.total_balance != null ? Number(data.total_balance) : 0;
    txnTotalBalance.textContent = currency(total);
    const gNote = group.length ? ` · ${group.length} group` : "";
    txnListMeta.textContent = `${personal.length} personal entries${gNote}`;
    renderRows(txnTableBody, personal, false);
    if (txnGroupSection && txnGroupTableBody) {
        if (group.length) {
            txnGroupSection.classList.remove("d-none");
            renderRows(txnGroupTableBody, group, true);
        } else {
            txnGroupSection.classList.add("d-none");
            txnGroupTableBody.innerHTML = "";
        }
    }
}

txnSaveBtn.addEventListener("click", async () => {
    clearTxnError();
    const amountVal = txnAmount.value.trim();
    if (amountVal === "") {
        showTxnError("Amount is required.");
        return;
    }
    if (txnType.value === "expense" && !txnCategory.value) {
        showTxnError("Choose an expense category.");
        return;
    }
    const payload = {
        amount: parseFloat(amountVal),
        transaction_type: txnType.value,
        description: txnDescription.value.trim() || null,
        category: txnType.value === "expense" ? (txnCategory.value || null) : null,
    };
    if (txnGroup) {
        const gv = txnGroup.value;
        payload.group_id = gv ? parseInt(gv, 10) : null;
    }

    const editId = txnEditId.value.trim();
    let res;
    if (editId) {
        res = await fetch(`/api/private/transactions/${editId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    } else {
        res = await fetch("/api/private/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showTxnError(err.error || "Save failed.");
        return;
    }
    txnModalInstance.hide();
    await refreshList();
});

if (openAddTxn && txnModal) {
    txnModalInstance = new bootstrap.Modal(txnModal);
    openAddTxn.addEventListener("click", () => {
        resetModalForAdd();
        txnModalInstance.show();
    });
    txnModal.addEventListener("show.bs.modal", (ev) => {
        if (ev.target === txnModal && !txnEditId.value) {
            resetModalForAdd();
        }
    });
}

loadUserGroups().then(refreshList);
