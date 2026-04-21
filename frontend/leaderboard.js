const PLAYERS = [
    { name: "Aria K.", saved: 5120, streak: 14, wins: 5, avatar: "AK", family: false },
    { name: "Noah P.", saved: 4760, streak: 10, wins: 2, avatar: "NP", family: false },
    { name: "Scout M.", saved: 4280, streak: 11, wins: 3, avatar: "SM", family: true },
    { name: "Liam J.", saved: 3890, streak: 8, wins: 1, avatar: "LJ", family: true },
    { name: "Mia T.", saved: 3535, streak: 6, wins: 1, avatar: "MT", family: true },
    { name: "Ethan R.", saved: 3010, streak: 5, wins: 0, avatar: "ER", family: true }
];

const topSaversCards = document.getElementById("topSaversCards");
const familyLeaderboardBody = document.getElementById("familyLeaderboardBody");
const familyCount = document.getElementById("familyCount");
const lastUpdated = document.getElementById("lastUpdated");
const worldTabBtn = document.getElementById("worldTabBtn");
const familyTabBtn = document.getElementById("familyTabBtn");
const worldSection = document.getElementById("worldSection");
const familySection = document.getElementById("familySection");

let activeSection = "world";

function currency(amount) {
    return `$${amount.toLocaleString("en-AU")}`;
}

function renderTopSavers() {
    const sorted = [...PLAYERS].sort((a, b) => b.saved - a.saved);
    const topThree = sorted.slice(0, 3);
    const totalTop = topThree.reduce((sum, person) => sum + person.saved, 0);

    topSaversCards.innerHTML = "";
    topThree.forEach((person, idx) => {
        const percentage = totalTop ? Math.round((person.saved / totalTop) * 100) : 0;
        topSaversCards.innerHTML += `
            <div class="col-lg-4">
                <div class="stat-card savings">
                    <div class="stat-label">#${idx + 1} Top Saver</div>
                    <div class="leader-name-wrap">
                        <div class="user-avatar">${person.avatar}</div>
                        <div>
                            <div class="podium-name">${person.name}</div>
                            <small class="page-subtitle">${person.streak} week streak</small>
                        </div>
                    </div>
                    <div class="stat-value">${currency(person.saved)}</div>
                    <div class="percentage-under">${percentage}% of top-3 savings</div>
                </div>
            </div>`;
    });
}

function renderFamilySection() {
    const familyPlayers = PLAYERS.filter((player) => player.family).sort((a, b) => b.saved - a.saved);
    const familyTotal = familyPlayers.reduce((sum, player) => sum + player.saved, 0);
    familyCount.textContent = `${familyPlayers.length} members`;
    familyLeaderboardBody.innerHTML = "";

    familyPlayers.forEach((player, index) => {
        const share = familyTotal ? Math.round((player.saved / familyTotal) * 100) : 0;
        familyLeaderboardBody.innerHTML += `
            <tr>
                <td>#${index + 1}</td>
                <td>
                    <div class="leader-name-wrap">
                        <div class="user-avatar">${player.avatar}</div>
                        <div>${player.name}</div>
                    </div>
                </td>
                <td class="text-end"><strong>${currency(player.saved)}</strong></td>
                <td class="text-end">${share}%</td>
                <td class="text-end">${player.streak} weeks</td>
                <td class="text-end">${player.wins}</td>
            </tr>`;
    });
}

function render() {
    renderTopSavers();
    renderFamilySection();
    updateSectionView();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function updateSectionView() {
    const showWorld = activeSection === "world";
    worldSection.classList.toggle("hidden-section", !showWorld);
    familySection.classList.toggle("hidden-section", showWorld);
    worldTabBtn.classList.toggle("active", showWorld);
    familyTabBtn.classList.toggle("active", !showWorld);
}

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

worldTabBtn.addEventListener("click", () => {
    activeSection = "world";
    updateSectionView();
});

familyTabBtn.addEventListener("click", () => {
    activeSection = "family";
    updateSectionView();
});

render();
