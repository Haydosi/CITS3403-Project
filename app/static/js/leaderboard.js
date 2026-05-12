// Real leaderboard data is fetched from the backend API
let worldLeaderboard = [];
let familyLeaderboard = [];

const topSaversCards = document.getElementById("topSaversCards");
const familyLeaderboardBody = document.getElementById("familyLeaderboardBody");
const familyCount = document.getElementById("familyCount");
const lastUpdated = document.getElementById("lastUpdated");
const worldTabBtn = document.getElementById("worldTabBtn");
const familyTabBtn = document.getElementById("familyTabBtn");
const worldSection = document.getElementById("worldSection");
const familySection = document.getElementById("familySection");

// Tracks which section is currently visible in the UI.
let activeSection = "world";

function currency(amount) {
    // Format amounts as AUD-style currency text (e.g. 5,120).
    return `$${amount.toLocaleString("en-AU")}`;
}

async function fetchLeaderboardData() {
    try {
        // Fetch world leaderboard
        const worldResponse = await fetch("/api/private/leaderboard");
        if (worldResponse.ok) {
            const data = await worldResponse.json();
            worldLeaderboard = data.leaderboard || [];
        } else {
            console.error("Failed to fetch world leaderboard");
            worldLeaderboard = [];
        }
        
        // Fetch family leaderboard (assuming group_id = 1 for now, can be made dynamic)
        const familyResponse = await fetch("/api/private/leaderboard/family/1");
        if (familyResponse.ok) {
            const data = await familyResponse.json();
            familyLeaderboard = data.leaderboard || [];
        } else {
            console.warn("No family group data available");
            familyLeaderboard = [];
        }
    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        worldLeaderboard = [];
        familyLeaderboard = [];
    }
}

function renderTopSavers() {
    // Build the top-3 global saver cards from real data.
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
                    <div class="stat-value">${currency(person.total_saved)}</div>
                    <div class="percentage-under">${percentage}% of top-3 savings</div>
                </div>
            </div>`;
    });
}

function renderFamilySection() {
    // Build the family-only ranking table from real data.
    const familyTotal = familyLeaderboard.reduce((sum, player) => sum + player.total_saved, 0);
    familyCount.textContent = `${familyLeaderboard.length} members`;
    familyLeaderboardBody.innerHTML = "";

    familyLeaderboard.forEach((player, index) => {
        const share = familyTotal ? Math.round((player.total_saved / familyTotal) * 100) : 0;
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
                <td class="text-end"><strong>${currency(player.total_saved)}</strong></td>
                <td class="text-end">${share}%</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
            </tr>`;
    });
}

function render() {
    // Initial/full refresh render used on page load.
    renderTopSavers();
    renderFamilySection();
    updateSectionView();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
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

// Fetch data and render on page load
fetchLeaderboardData().then(() => {
    render();
});
