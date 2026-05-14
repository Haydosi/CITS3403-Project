/**
 * Groups page: /api/private/groups
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

function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}

function render() {
    if (!cachedGroups.length) {
        groupsList.innerHTML =
            '<div class="grp-empty anim-in">You are not in any group yet. Create one to share savings with others.</div>';
        return;
    }

    groupsList.innerHTML = "";
    cachedGroups.forEach((g) => {
        const myRole = g.my_role || "member";
        const card = document.createElement("section");
        card.className = "grp-card anim-in";
        const inviteBtn =
            canInvite(myRole)
                ? `<button type="button" class="btn btn-sm btn-outline-light grp-invite" data-id="${g.id}">Invite</button>`
                : "";
        const renameBtn =
            canRename(myRole)
                ? `<button type="button" class="btn btn-sm btn-outline-light grp-rename" data-id="${g.id}">Rename</button>`
                : "";

        const rows = (g.members || [])
            .map((m) => {
                const isMe = document.body.getAttribute("data-user-id") === String(m.id);
                const removeOthers =
                    canInvite(myRole) &&
                    !isMe &&
                    (myRole === "owner" || (myRole === "admin" && m.user_role === "member"));
                const removeSelf = isMe;
                let removeBtn = "";
                if (removeOthers || removeSelf) {
                    removeBtn = `<button type="button" class="btn btn-sm btn-outline-danger grp-remove" data-gid="${g.id}" data-uid="${m.id}">${removeSelf ? "Leave" : "Remove"}</button>`;
                }
                return `<tr>
                    <td>${escapeHtml(displayName(m))}</td>
                    <td class="text-secondary small">${escapeHtml(m.email || "")}</td>
                    <td><span class="grp-role-pill">${escapeHtml(m.user_role || "")}</span></td>
                    <td class="text-end">${removeBtn}</td>
                </tr>`;
            })
            .join("");

        card.innerHTML = `
            <div class="grp-card-head">
                <div>
                    <h3 class="grp-title">${escapeHtml(g.group_name)}</h3>
                    <div class="grp-meta">${g.member_count || 0} members · You are <strong>${escapeHtml(myRole)}</strong></div>
                </div>
                <div class="grp-actions">
                    ${renameBtn}
                    ${inviteBtn}
                </div>
            </div>
            <div class="grp-body">
                <div class="table-responsive">
                    <table class="txn-table">
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
        groupsList.appendChild(card);
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

openCreateGroup.addEventListener("click", () => {
    newGroupName.value = "";
    clearErr();
    createModal.show();
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

loadGroups();
