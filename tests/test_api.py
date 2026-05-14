import unittest
from app import create_app, db


class TestConfig:
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    SECRET_KEY = "test-secret-key"


class ApiTestCase(unittest.TestCase):
    """API test suite for the new JSON endpoints."""

    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _register_user(self, email="user@example.com", password="password123"):
        # Helper to register a user using the public API endpoint.
        return self.client.post(
            "/api/public/auth/register",
            json={
                "email": email,
                "password": password,
                "confirm_password": password,
            },
        )

    def _login_user(self, email="user@example.com", password="password123"):
        # Helper to log in a user using the public API endpoint.
        return self.client.post(
            "/api/public/auth/login",
            json={"email": email, "password": password},
        )

    def test_register_api_success(self):
        # Registering a new account should return success and the created user.
        response = self._register_user()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json["success"])
        self.assertEqual(response.json["user"]["email"], "user@example.com")

    def test_register_api_duplicate_email(self):
        # Registering the same email twice should return a 409 conflict.
        self._register_user()
        response = self._register_user()
        self.assertEqual(response.status_code, 409)
        self.assertIn("already exists", response.json["error"])

    def test_login_api_success(self):
        # Valid credentials should log the user in and return user details.
        self._register_user()
        response = self._login_user()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["success"])
        self.assertEqual(response.json["user"]["email"], "user@example.com")

    def test_login_api_wrong_password(self):
        # Incorrect password should fail with a 401 error.
        self._register_user()
        response = self.client.post(
            "/api/public/auth/login",
            json={"email": "user@example.com", "password": "wrongpass"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid email or password", response.json["error"])

    def test_current_user_api_requires_auth(self):
        # Private auth/user should require authentication.
        response = self.client.get("/api/private/auth/user")
        self.assertEqual(response.status_code, 401)

    def test_current_user_api_returns_authenticated_user(self):
        # After login, private auth/user should return current user information.
        self._register_user()
        self._login_user()
        response = self.client.get("/api/private/auth/user")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["user"]["email"], "user@example.com")

    def test_debt_loan_repayments_api(self):
        # The repayment calculator should return payment summary values.
        response = self.client.post(
            "/api/public/debt/loan/repayments",
            json={
                "amount": 10000,
                "rate": 5,
                "term": 5,
                "freq": 12,
                "fee": 0,
                "fee_freq": 1,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("payment", response.json)
        self.assertIn("total_interest", response.json)

    def test_debt_loan_borrow_api(self):
        # The borrowing capacity endpoint should return a principal amount.
        response = self.client.post(
            "/api/public/debt/loan/borrow",
            json={
                "payment": 500,
                "rate": 5,
                "term": 5,
                "freq": 12,
                "fee": 0,
                "fee_freq": 1,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("principal", response.json)

    def test_debt_loan_sooner_api(self):
        # The repay-sooner endpoint should estimate repayment duration.
        response = self.client.post(
            "/api/public/debt/loan/sooner",
            json={
                "amount": 10000,
                "payment": 300,
                "rate": 5,
                "freq": 12,
                "fee": 0,
                "fee_freq": 1,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("periods", response.json)
        self.assertIn("years", response.json)
        self.assertIn("months", response.json)

    def test_groups_list_requires_auth(self):
        self.assertEqual(self.client.get("/api/private/groups").status_code, 401)

    def test_create_and_list_groups(self):
        self._register_user()
        self._login_user()
        r = self.client.post("/api/private/groups", json={"group_name": "Test Fam"})
        self.assertEqual(r.status_code, 201, r.get_json())
        body = r.get_json()
        self.assertEqual(body["group"]["group_name"], "Test Fam")
        self.assertEqual(body["group"]["my_role"], "owner")
        lst = self.client.get("/api/private/groups")
        self.assertEqual(lst.status_code, 200)
        self.assertEqual(len(lst.get_json()["groups"]), 1)

    def test_invite_member_and_duplicate(self):
        self._register_user(email="owner@example.com")
        self._login_user(email="owner@example.com")
        r = self.client.post("/api/private/groups", json={"group_name": "Shared"})
        self.assertEqual(r.status_code, 201)
        gid = r.get_json()["group"]["id"]

        self._register_user(email="member@example.com", password="password123")
        self._login_user(email="owner@example.com", password="password123")
        add = self.client.post(
            f"/api/private/groups/{gid}/members", json={"email": "member@example.com"}
        )
        self.assertEqual(add.status_code, 201, add.get_json())
        dup = self.client.post(
            f"/api/private/groups/{gid}/members", json={"email": "member@example.com"}
        )
        self.assertEqual(dup.status_code, 409)

        lst = self.client.get("/api/private/groups")
        members = lst.get_json()["groups"][0]["members"]
        self.assertEqual(len(members), 2)

    def test_owner_removes_member(self):
        self._register_user(email="o@o.com")
        self._login_user(email="o@o.com")
        gid = self.client.post("/api/private/groups", json={"group_name": "G"}).get_json()["group"]["id"]
        self._register_user(email="m@m.com", password="password123")
        self._login_user(email="o@o.com", password="password123")
        self.client.post(f"/api/private/groups/{gid}/members", json={"email": "m@m.com"})
        lst = self.client.get("/api/private/groups").get_json()
        members = lst["groups"][0]["members"]
        mid = next(m["id"] for m in members if m["email"] == "m@m.com")
        rem = self.client.delete(f"/api/private/groups/{gid}/members/{mid}")
        self.assertEqual(rem.status_code, 200)
        lst2 = self.client.get("/api/private/groups").get_json()
        self.assertEqual(len(lst2["groups"][0]["members"]), 1)


if __name__ == "__main__":
    unittest.main()
