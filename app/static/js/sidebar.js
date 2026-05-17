(function () {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const toggle = document.getElementById("sidebarToggle");
    if (!sidebar || !overlay || !toggle) return;

    toggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show");
    });
    overlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
    });

    const logout = document.querySelector('[data-action="logout"]');
    if (logout) {
        logout.addEventListener("click", (e) => {
            if (!window.confirm("Log out of MyMoney?")) {
                e.preventDefault();
            }
        });
    }
})();
