import os
import tempfile
import threading
import time
import unittest

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from app import create_app, db
from app.seed import seed_if_empty, TEST_EMAIL, TEST_PASSWORD
from config import Config

PORT = 5001
BASE = f"http://localhost:{PORT}"

_db_path: str | None = None


class _SeleniumConfig(Config):
    TESTING = True
    WTF_CSRF_ENABLED = False


def setUpModule():
    global _db_path
    fd, _db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)

    class _Cfg(_SeleniumConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{_db_path}"

    flask_app = create_app(_Cfg())

    with flask_app.app_context():
        db.create_all()
        seed_if_empty()

    server = threading.Thread(
        target=lambda: flask_app.run(port=PORT, use_reloader=False, threaded=True),
        daemon=True,
    )
    server.start()
    time.sleep(1)


def tearDownModule():
    if _db_path and os.path.exists(_db_path):
        os.unlink(_db_path)


class SeleniumTestCase(unittest.TestCase):
    """Base class: one driver per test. Server is shared across all test classes."""

    def setUp(self):
        opts = Options()
        opts.add_argument("--headless")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        self.driver = webdriver.Chrome(options=opts)
        self.driver.implicitly_wait(5)
        self.wait = WebDriverWait(self.driver, 10)

    def tearDown(self):
        self.driver.quit()

    def _login(self, email=TEST_EMAIL, password=TEST_PASSWORD):
        self.driver.get(f"{BASE}/login")
        self.driver.find_element(By.NAME, "email").send_keys(email)
        self.driver.find_element(By.NAME, "password").send_keys(password)
        self.driver.find_element(By.CSS_SELECTOR, "[type=submit]").click()


class TestAuth(SeleniumTestCase):

    def test_login_page_loads(self):
        self.driver.get(f"{BASE}/login")
        self.assertIn("Login", self.driver.title)

    def test_register_page_loads(self):
        self.driver.get(f"{BASE}/register")
        self.assertIn("Register", self.driver.title)

    def test_login_success_leaves_login_page(self):
        self._login()
        self.wait.until(EC.url_changes(f"{BASE}/login"))
        self.assertNotIn("login", self.driver.current_url)

    def test_login_wrong_password_stays_on_login(self):
        self._login(password="wrongpassword")
        self.assertIn("login", self.driver.current_url)

    def test_login_unknown_email_stays_on_login(self):
        self._login(email="nobody@example.com")
        self.assertIn("login", self.driver.current_url)


class TestProtectedRoutes(SeleniumTestCase):

    def test_dashboard_redirects_to_login_when_logged_out(self):
        self.driver.get(f"{BASE}/")
        self.assertIn("login", self.driver.current_url)

    def test_leaderboard_redirects_to_login_when_logged_out(self):
        self.driver.get(f"{BASE}/leaderboard")
        self.assertIn("login", self.driver.current_url)

    def test_dashboard_accessible_after_login(self):
        self._login()
        self.wait.until(EC.url_changes(f"{BASE}/login"))
        self.driver.get(f"{BASE}/")
        self.assertNotIn("login", self.driver.current_url)

    def test_leaderboard_accessible_after_login(self):
        self._login()
        self.wait.until(EC.url_changes(f"{BASE}/login"))
        self.driver.get(f"{BASE}/leaderboard")
        self.assertNotIn("login", self.driver.current_url)

    def test_groups_redirects_to_login_when_logged_out(self):
        self.driver.get(f"{BASE}/groups")
        self.assertIn("login", self.driver.current_url)

    def test_groups_accessible_after_login(self):
        self._login()
        self.wait.until(EC.url_changes(f"{BASE}/login"))
        self.driver.get(f"{BASE}/groups")
        self.assertNotIn("login", self.driver.current_url)

    def test_transactions_redirects_to_login_when_logged_out(self):
        self.driver.get(f"{BASE}/transactions")
        self.assertIn("login", self.driver.current_url)

    def test_transactions_accessible_after_login(self):
        self._login()
        self.wait.until(EC.url_changes(f"{BASE}/login"))
        self.driver.get(f"{BASE}/transactions")
        self.assertNotIn("login", self.driver.current_url)


if __name__ == "__main__":
    unittest.main()