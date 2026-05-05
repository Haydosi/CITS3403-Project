// Tab switching — calculation logic to be added later
(function () {
    const tabs = [
        { btn: 'tabPersonalLoan', section: 'sectionPersonalLoan' },
        { btn: 'tabCreditCard',   section: 'sectionCreditCard'   },
        { btn: 'tabMortgage',     section: 'sectionMortgage'     },
    ];

    tabs.forEach(({ btn, section }) => {
        document.getElementById(btn).addEventListener('click', function () {
            tabs.forEach(t => {
                document.getElementById(t.btn).classList.remove('active');
                document.getElementById(t.section).classList.add('hidden-section');
            });
            this.classList.add('active');
            document.getElementById(section).classList.remove('hidden-section');
        });
    });

    // Sidebar toggle (shared pattern from other pages)
    const toggle  = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('show');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        });
    }
}());