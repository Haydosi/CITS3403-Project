import unittest
from app import create_app, db
from app.models import User
from config import TestingConfig


class UserManagementTestCase(unittest.TestCase):

    def setUp(self):
        self.app = create_app(TestingConfig())
        self.client = self.app.test_client()
        with self.app.app_context():
            db.create_all()
            u = User(username="testuser", email="test@example.com",
                     first_name="Test", last_name="User")
            u.set_password("password123")
            db.session.add(u)
            db.session.commit()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _login(self, email="test@example.com", password="password123"):
        return self.client.post("/login", data={
            "email": email,
            "password": password,
        }, follow_redirects=True)

    # ── /profile access ───────────────────────────────────────────────────────

    def test_profile_requires_login(self):
        response = self.client.get("/profile", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])

    def test_profile_accessible_when_logged_in(self):
        self._login()
        response = self.client.get("/profile")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"My Profile", response.data)

    def test_profile_shows_current_user_info(self):
        self._login()
        response = self.client.get("/profile")
        self.assertIn(b"testuser", response.data)
        self.assertIn(b"test@example.com", response.data)
        self.assertIn(b"Test", response.data)
        self.assertIn(b"User", response.data)

    # ── Edit profile ──────────────────────────────────────────────────────────

    def test_edit_profile_success(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "newname",
            "email": "new@example.com",
            "first_name": "Alice",
            "last_name": "Smith",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Profile updated successfully", response.data)
        with self.app.app_context():
            u = User.query.filter_by(email="new@example.com").first()
            self.assertIsNotNone(u)
            self.assertEqual(u.username, "newname")
            self.assertEqual(u.first_name, "Alice")
            self.assertEqual(u.last_name, "Smith")

    def test_edit_profile_clears_optional_name_fields(self):
        self._login()
        self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "testuser",
            "email": "test@example.com",
            "first_name": "",
            "last_name": "",
        }, follow_redirects=True)
        with self.app.app_context():
            u = User.query.filter_by(username="testuser").first()
            self.assertIsNone(u.first_name)
            self.assertIsNone(u.last_name)

    def test_edit_profile_duplicate_username_rejected(self):
        with self.app.app_context():
            other = User(username="taken", email="other@example.com")
            other.set_password("pass")
            db.session.add(other)
            db.session.commit()

        self._login()
        response = self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "taken",
            "email": "test@example.com",
            "first_name": "",
            "last_name": "",
        }, follow_redirects=True)
        self.assertIn(b"already taken", response.data)
        with self.app.app_context():
            u = User.query.filter_by(email="test@example.com").first()
            self.assertEqual(u.username, "testuser")

    def test_edit_profile_duplicate_email_rejected(self):
        with self.app.app_context():
            other = User(username="other", email="taken@example.com")
            other.set_password("pass")
            db.session.add(other)
            db.session.commit()

        self._login()
        response = self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "testuser",
            "email": "taken@example.com",
            "first_name": "",
            "last_name": "",
        }, follow_redirects=True)
        self.assertIn(b"already exists", response.data)
        with self.app.app_context():
            u = User.query.filter_by(username="testuser").first()
            self.assertEqual(u.email, "test@example.com")

    def test_edit_profile_username_too_short_rejected(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "ab",
            "email": "test@example.com",
            "first_name": "",
            "last_name": "",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            u = User.query.filter_by(email="test@example.com").first()
            self.assertEqual(u.username, "testuser")

    def test_edit_profile_invalid_email_rejected(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "testuser",
            "email": "not-an-email",
            "first_name": "",
            "last_name": "",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            u = User.query.filter_by(username="testuser").first()
            self.assertEqual(u.email, "test@example.com")

    def test_edit_profile_preserves_own_username_and_email(self):
        """Saving without changes should succeed (no false uniqueness conflict)."""
        self._login()
        response = self.client.post("/profile", data={
            "action": "edit_profile",
            "username": "testuser",
            "email": "test@example.com",
            "first_name": "Test",
            "last_name": "User",
        }, follow_redirects=True)
        self.assertIn(b"Profile updated successfully", response.data)

    # ── Change password ───────────────────────────────────────────────────────

    def test_change_password_success(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "change_password",
            "current_password": "password123",
            "new_password": "newpassword99",
            "confirm_password": "newpassword99",
        }, follow_redirects=True)
        self.assertIn(b"Password changed successfully", response.data)
        with self.app.app_context():
            u = User.query.filter_by(email="test@example.com").first()
            self.assertTrue(u.check_password("newpassword99"))
            self.assertFalse(u.check_password("password123"))

    def test_change_password_wrong_current_rejected(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "change_password",
            "current_password": "wrongpassword",
            "new_password": "newpassword99",
            "confirm_password": "newpassword99",
        }, follow_redirects=True)
        self.assertIn(b"Current password is incorrect", response.data)
        with self.app.app_context():
            u = User.query.filter_by(email="test@example.com").first()
            self.assertTrue(u.check_password("password123"))

    def test_change_password_mismatch_rejected(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "change_password",
            "current_password": "password123",
            "new_password": "newpassword99",
            "confirm_password": "different99",
        }, follow_redirects=True)
        self.assertIn(b"Passwords must match", response.data)
        with self.app.app_context():
            u = User.query.filter_by(email="test@example.com").first()
            self.assertTrue(u.check_password("password123"))

    def test_change_password_too_short_rejected(self):
        self._login()
        response = self.client.post("/profile", data={
            "action": "change_password",
            "current_password": "password123",
            "new_password": "short",
            "confirm_password": "short",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            u = User.query.filter_by(email="test@example.com").first()
            self.assertTrue(u.check_password("password123"))

    def test_change_password_requires_login(self):
        response = self.client.post("/profile", data={
            "action": "change_password",
            "current_password": "password123",
            "new_password": "newpassword99",
            "confirm_password": "newpassword99",
        }, follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])


if __name__ == "__main__":
    unittest.main()