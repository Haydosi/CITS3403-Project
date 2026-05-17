// Real leaderboard data is fetched from the backend API
let worldLeaderboard = [];
let familyLeaderboard = [];
let currentUserTotalSavings = 0;

const topSaversCards = document.getElementById("topSaversCards");
const familyLeaderboardBody = document.getElementById("familyLeaderboardBody");
const familyCount = document.getElementById("familyCount");
const currentTime = document.getElementById("currentTime");
const currentTimeLabel = currentTime?.querySelector("span");
const worldTabBtn = document.getElementById("worldTabBtn");
const familyTabBtn = document.getElementById("familyTabBtn");
const worldSection = document.getElementById("worldSection");
const familySection = document.getElementById("familySection");
const mySavingsAmount = document.getElementById("mySavingsAmount");
const familyGroupSelect = document.getElementById("familyGroupSelect");
const familyGroupToolbar = document.getElementById("familyGroupToolbar");
const familyLeaderboardEmpty = document.getElementById("familyLeaderboardEmpty");
const familyLeaderboardTableWrap = document.getElementById("familyLeaderboardTableWrap");

const LEADERBOARD_GROUP_STORAGE_KEY = "leaderboardSelectedGroupId";

// Tracks which section is currently visible in the UI.
let activeSection = "world";
let leaderboardGroups = [];
let selectedFamilyGroupId = null;

function currency(amount) {
    // Format amounts as AUD-style currency text (e.g. 5,120).
    return `$${amount.toLocaleString("en-AU")}`;
}

function storeMySavings(amount) {
    // Store user's total savings in localStorage for privacy
    localStorage.setItem("mySavingsTotal", JSON.stringify({
        amount: amount,
        timestamp: new Date().toISOString()
    }));
}

function getMySavings() {
    // Retrieve user's total savings from localStorage
    const saved = localStorage.getItem("mySavingsTotal");
    if (saved) {
        const data = JSON.parse(saved);
        return data.amount;
    }
    return 0;
}

function updateMySavingsDisplay() {
    // Update the "My Total Savings" section with locally stored data
    if (mySavingsAmount) {
        mySavingsAmount.textContent = currency(currentUserTotalSavings);
    }
}

async function fetchLeaderboardData() {
    try {
        // Fetch world leaderboard
        const worldResponse = await fetch("/api/private/leaderboard");
        if (worldResponse.ok) {
            const data = await worldResponse.json();
            worldLeaderboard = data.leaderboard || [];
            
            // Find current user in world leaderboard and store their total
            const currentUser = worldLeaderboard.find(user => user.id === getCurrentUserId());
            if (currentUser) {
                currentUserTotalSavings = currentUser.total_saved;
                storeMySavings(currentUserTotalSavings);
            }
        } else {
            console.error("Failed to fetch world leaderboard");
            worldLeaderboard = [];
        }
        
        const groupsRes = await fetch("/api/private/me/groups?leaderboard=1");
        leaderboardGroups = [];
        if (groupsRes.ok) {
            const gdata = await groupsRes.json();
            leaderboardGroups = gdata.groups || [];
        }
        populateFamilyGroupSelect();
        const familyGroupId = resolveSelectedFamilyGroupId();
        if (familyGroupId != null) {
            const familyResponse = await fetch(
                `/api/private/leaderboard/family/${familyGroupId}`
            );
            if (familyResponse.ok) {
                const data = await familyResponse.json();
                familyLeaderboard = data.leaderboard || [];
            } else {
                console.warn("No family group data available");
                familyLeaderboard = [];
            }
        } else {
            familyLeaderboard = [];
        }
    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        worldLeaderboard = [];
        familyLeaderboard = [];
        // Try to restore from localStorage if API fails
        const saved = getMySavings();
        if (saved > 0) {
            currentUserTotalSavings = saved;
        }
    }
}

function readStoredFamilyGroupId() {
    const raw = localStorage.getItem(LEADERBOARD_GROUP_STORAGE_KEY);
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isFinite(id) ? id : null;
}

function storeSelectedFamilyGroupId(groupId) {
    localStorage.setItem(LEADERBOARD_GROUP_STORAGE_KEY, String(groupId));
}

function resolveSelectedFamilyGroupId() {
    if (!leaderboardGroups.length) {
        selectedFamilyGroupId = null;
        return null;
    }
    const stored = readStoredFamilyGroupId();
    const validStored = leaderboardGroups.some((g) => g.id === stored);
    if (validStored) {
        selectedFamilyGroupId = stored;
    } else {
        selectedFamilyGroupId = leaderboardGroups[0].id;
        storeSelectedFamilyGroupId(selectedFamilyGroupId);
    }
    if (familyGroupSelect) {
        familyGroupSelect.value = String(selectedFamilyGroupId);
    }
    return selectedFamilyGroupId;
}

function populateFamilyGroupSelect() {
    if (!familyGroupSelect) return;
    familyGroupSelect.innerHTML = "";
    leaderboardGroups.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = String(g.id);
        opt.textContent = g.group_name || `Group #${g.id}`;
        familyGroupSelect.appendChild(opt);
    });
}

function updateFamilyLeaderboardVisibility() {
    const hasGroups = leaderboardGroups.length > 0;
    if (familyGroupToolbar) {
        familyGroupToolbar.classList.toggle("d-none", !hasGroups);
    }
    if (familyLeaderboardEmpty) {
        familyLeaderboardEmpty.classList.toggle("d-none", hasGroups);
    }
    if (familyLeaderboardTableWrap) {
        familyLeaderboardTableWrap.classList.toggle("d-none", !hasGroups);
    }
    if (familyCount) {
        familyCount.classList.toggle("d-none", !hasGroups);
    }
}

function getCurrentUserId() {
    // Get current user ID from the DOM data attribute
    const userElement = document.querySelector('[data-user-id]');
    if (userElement) {
        return parseInt(userElement.getAttribute('data-user-id'));
    }
    return null;
}

function renderTopSavers() {
    // Build the top-3 global saver cards showing percentages.
    const topThree = worldLeaderboard.slice(0, 3);
    const totalTop = topThree.reduce((sum, person) => sum + person.total_saved, 0);

    topSaversCards.innerHTML = "";
    topThree.forEach((person, idx) => {
        const percentage = totalTop ? Math.round((person.total_saved / totalTop) * 100) : 0;
        const displayName = person.first_name || person.username || "Anonymous";
        topSaversCards.innerHTML += `
            <div class="col-lg-4">
                <div class="stat-card savings">
                    <div class="stat-label">#${idx + 1} Top Saver</div>
                    <div class="leader-name-wrap">
                        <div class="user-avatar">${displayName.substring(0, 2).toUpperCase()}</div>
                        <div>
                            <div class="podium-name">${displayName}</div>
                            <small class="page-subtitle">${person.email}</small>
                        </div>
                    </div>
                    <div class="stat-value">${percentage}%</div>
                    <div class="percentage-under">of top-3 savings</div>
                </div>
            </div>`;
    });
}

function renderFamilySection() {
    // Build the family-only ranking table showing percentages.
    updateFamilyLeaderboardVisibility();
    const familyTotal = familyLeaderboard.reduce((sum, player) => sum + player.total_saved, 0);
    familyCount.textContent = `${familyLeaderboard.length} members`;
    familyLeaderboardBody.innerHTML = "";

    familyLeaderboard.forEach((player, index) => {
        const percentage = familyTotal ? Math.round((player.total_saved / familyTotal) * 100) : 0;
        const displayName = player.first_name || player.username || "Anonymous";
        familyLeaderboardBody.innerHTML += `
            <tr>
                <td>#${index + 1}</td>
                <td>
                    <div class="leader-name-wrap">
                        <div class="user-avatar">${displayName.substring(0, 2).toUpperCase()}</div>
                        <div>${displayName}</div>
                    </div>
                </td>
                <td class="text-end"><strong>${percentage}%</strong></td>
            </tr>`;
    });
}

function render() {
    // Initial/full refresh render used on page load.
    renderTopSavers();
    renderFamilySection();
    updateMySavingsDisplay();
    updateSectionView();
}

function formatLocalTime(date = new Date()) {
    return date.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function updateCurrentTimeDisplay() {
    if (!currentTimeLabel) return;
    currentTimeLabel.textContent = formatLocalTime();
}

function startLiveClock() {
    updateCurrentTimeDisplay();
    setInterval(updateCurrentTimeDisplay, 1000);
}

function updateSectionView() {
    // Show one section at a time and keep tab button states in sync.
    const showWorld = activeSection === "world";
    worldSection.classList.toggle("hidden-section", !showWorld);
    familySection.classList.toggle("hidden-section", showWorld);
    worldTabBtn.classList.toggle("active", showWorld);
    familyTabBtn.classList.toggle("active", !showWorld);
}

// Mobile sidebar open/close behaviour.
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
const toggle = document.getElementById("sidebarToggle");
toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
});
overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
});

// Section tab handlers only switch visible content.
worldTabBtn.addEventListener("click", () => {
    activeSection = "world";
    updateSectionView();
});

familyTabBtn.addEventListener("click", () => {
    activeSection = "family";
    updateSectionView();
});

if (familyGroupSelect) {
    familyGroupSelect.addEventListener("change", async () => {
        const nextId = parseInt(familyGroupSelect.value, 10);
        if (!Number.isFinite(nextId) || nextId === selectedFamilyGroupId) return;
        selectedFamilyGroupId = nextId;
        storeSelectedFamilyGroupId(nextId);
        await refreshLeaderboardAndRender();
    });
}

// AJAX auto-refresh every 5 minutes; live clock in #currentTime
const leaderboardAutoRefreshMs = 5 * 60 * 1000;
let leaderboardAutoRefreshInFlight = false;
let leaderboardAutoRefreshTimerId = null;

async function refreshLeaderboardAndRender() {
    if (leaderboardAutoRefreshInFlight) return;
    leaderboardAutoRefreshInFlight = true;
    try {
        await fetchLeaderboardData();
        render();
    } catch (err) {
        console.error("Leaderboard auto-refresh failed:", err);
    } finally {
        leaderboardAutoRefreshInFlight = false;
    }
}

function startLeaderboardAutoRefresh() {
    if (leaderboardAutoRefreshTimerId != null) return;

    leaderboardAutoRefreshTimerId = setInterval(() => {
        if (document.hidden) return;
        refreshLeaderboardAndRender();
    }, leaderboardAutoRefreshMs);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshLeaderboardAndRender();
    });
}

fetchLeaderboardData().then(() => {
    render();
    startLiveClock();
    startLeaderboardAutoRefresh();
});
