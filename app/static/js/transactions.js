/**
 * Transactions page: list, create, edit, delete via /api/private/transactions
 */

const txnTableBody = document.getElementById("txnTableBody");
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
const txnDescription = document.getElementById("txnDescription");
const txnGroup = document.getElementById("txnGroup");
const txnSaveBtn = document.getElementById("txnSaveBtn");
const openAddTxn = document.getElementById("openAddTxn");

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

function resetModalForAdd() {
    txnEditId.value = "";
    txnModalLabel.textContent = "Add transaction";
    txnAmount.value = "";
    txnType.value = "savings";
    txnCategory.value = "";
    txnDescription.value = "";
    txnGroup.value = "";
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
    txnGroup.value = row.group_id ? String(row.group_id) : "";
    updateCategoryVisibility();
    clearTxnError();
    txnModalInstance.show();
}

async function loadGroupsIntoSelect() {
    const res = await fetch("/api/private/me/groups");
    if (!res.ok) return;
    const data = await res.json();
    const groups = data.groups || [];
    const keep = txnGroup.querySelector('option[value=""]');
    txnGroup.innerHTML = "";
    txnGroup.appendChild(keep);
    groups.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = String(g.id);
        opt.textContent = g.group_name || `Group #${g.id}`;
        txnGroup.appendChild(opt);
    });
}

function renderRows(transactions) {
    txnTableBody.innerHTML = "";
    transactions.forEach((row) => {
        const amt = Number(row.amount);
        const amtClass = amt < 0 ? "txn-amount-neg" : "txn-amount-pos";
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${formatDate(row.created_at)}</td>
            <td><span class="txn-type-pill ${typeClass(row.transaction_type)}">${row.transaction_type || "—"}</span></td>
            <td>${escapeHtml(row.description || "—")}</td>
            <td>${escapeHtml(row.group_name || "—")}</td>
            <td class="text-end ${amtClass}">${currency(amt)}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-light me-1 txn-edit" data-id="${row.id}">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger txn-del" data-id="${row.id}">Delete</button>
            </td>`;
        txnTableBody.appendChild(tr);
    });

    txnTableBody.querySelectorAll(".txn-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.getAttribute("data-id"), 10);
            const row = transactions.find((t) => t.id === id);
            if (row) openModalForEdit(row);
        });
    });

    txnTableBody.querySelectorAll(".txn-del").forEach((btn) => {
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
    const list = data.transactions || [];
    const total = data.total_balance != null ? Number(data.total_balance) : 0;
    txnTotalBalance.textContent = currency(total);
    txnListMeta.textContent = `${list.length} entries loaded`;
    renderRows(list);
}

txnSaveBtn.addEventListener("click", async () => {
    clearTxnError();
    const amountVal = txnAmount.value.trim();
    if (amountVal === "") {
        showTxnError("Amount is required.");
        return;
    }
    const payload = {
        amount: parseFloat(amountVal),
        transaction_type: txnType.value,
        description: txnDescription.value.trim() || null,
        category: txnType.value === "expense" ? (txnCategory.value || null) : null,
    };
    const gid = txnGroup.value.trim();
    if (gid) payload.group_id = parseInt(gid, 10);

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

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
const toggle = document.getElementById("sidebarToggle");
if (toggle && sidebar && overlay) {
    toggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show");
    });
    overlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
    });
}

loadGroupsIntoSelect().then(() => refreshList());
