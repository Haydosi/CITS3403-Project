import unittest
from app import create_app, db
from app.models import User
from config import TestingConfig


class AuthTestCase(unittest.TestCase):

    def setUp(self):
        self.app = create_app(TestingConfig())
        self.client = self.app.test_client()
        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    # --- User model ---

    def test_password_hashing(self):
        with self.app.app_context():
            u = User(email="a@example.com", username="a@example.com")
            u.set_password("hunter2")
            self.assertNotEqual(u.password_hash, "hunter2")
            self.assertTrue(u.check_password("hunter2"))
            self.assertFalse(u.check_password("wrong"))

    def test_password_hash_is_salted(self):
        with self.app.app_context():
            u1 = User(email="a@example.com", username="a@example.com")
            u2 = User(email="b@example.com", username="b@example.com")
            u1.set_password("same")
            u2.set_password("same")
            self.assertNotEqual(u1.password_hash, u2.password_hash)

    # --- /register ---

    def test_register_get(self):
        response = self.client.get("/register")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Register", response.data)

    def test_register_success(self):
        response = self.client.post("/register", data={
            "email": "new@example.com",
            "password": "password123",
            "confirm_password": "password123",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Login", response.data)
        with self.app.app_context():
            self.assertIsNotNone(User.query.filter_by(
                email="new@example.com").first())

    def test_register_duplicate_email(self):
        with self.app.app_context():
            u = User(email="existing@example.com",
                     username="existing@example.com")
            u.set_password("pass")
            db.session.add(u)
            db.session.commit()

        response = self.client.post("/register", data={
            "email": "existing@example.com",
            "password": "newpass",
            "confirm_password": "newpass",
        }, follow_redirects=True)
        self.assertIn(b"already exists", response.data)

    def test_register_password_mismatch(self):
        response = self.client.post("/register", data={
            "email": "user@example.com",
            "password": "abc123",
            "confirm_password": "different",
        }, follow_redirects=True)
        self.assertIn(b"Passwords must match", response.data)

    def test_register_missing_fields(self):
        response = self.client.post("/register", data={
            "email": "",
            "password": "",
            "confirm_password": "",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            self.assertEqual(User.query.count(), 0)

    # --- /login ---

    def _create_user(self, email="user@example.com", password="password123"):
        with self.app.app_context():
            u = User(email=email, username=email)
            u.set_password(password)
            db.session.add(u)
            db.session.commit()

    def test_login_get(self):
        response = self.client.get("/login")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Login", response.data)

    def test_login_success(self):
        self._create_user()
        response = self.client.post("/login", data={
            "email": "user@example.com",
            "password": "password123",
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)

    def test_login_wrong_password(self):
        self._create_user()
        response = self.client.post("/login", data={
            "email": "user@example.com",
            "password": "wrongpass",
        }, follow_redirects=True)
        self.assertIn(b"Invalid email or password", response.data)

    def test_login_unknown_email(self):
        response = self.client.post("/login", data={
            "email": "nobody@example.com",
            "password": "whatever",
        }, follow_redirects=True)
        self.assertIn(b"Invalid email or password", response.data)

    # --- /logout ---

    def test_logout_redirects_to_login(self):
        self._create_user()
        self.client.post("/login", data={
            "email": "user@example.com",
            "password": "password123",
        })
        response = self.client.get("/logout", follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Login", response.data)

    # --- protected routes ---

    def test_dashboard_requires_login(self):
        response = self.client.get("/", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])

    def test_leaderboard_requires_login(self):
        response = self.client.get("/leaderboard", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])

    def test_dashboard_accessible_when_logged_in(self):
        self._create_user()
        self.client.post("/login", data={
            "email": "user@example.com",
            "password": "password123",
        })
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
