import unittest
from app import create_app, db
from app.models import User


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

    def test_transactions_list_requires_auth(self):
        response = self.client.get("/api/private/transactions")
        self.assertEqual(response.status_code, 401)

    def test_my_groups_requires_auth(self):
        response = self.client.get("/api/private/me/groups")
        self.assertEqual(response.status_code, 401)

    def test_transactions_create_list_patch_delete(self):
        self._register_user()
        self._login_user()
        create = self.client.post(
            "/api/private/transactions",
            json={
                "amount": 75.25,
                "transaction_type": "savings",
                "description": "Test save",
            },
        )
        self.assertEqual(create.status_code, 201, create.get_json())
        tid = create.get_json()["transaction"]["id"]
        self.assertEqual(create.get_json()["transaction"]["transaction_type"], "savings")

        listed = self.client.get("/api/private/transactions")
        self.assertEqual(listed.status_code, 200)
        body = listed.get_json()
        self.assertEqual(len(body["transactions"]), 1)
        self.assertAlmostEqual(body["total_balance"], 75.25, places=2)

        patched = self.client.patch(
            f"/api/private/transactions/{tid}",
            json={"amount": 100, "transaction_type": "expense"},
        )
        self.assertEqual(patched.status_code, 200)
        self.assertAlmostEqual(patched.get_json()["transaction"]["amount"], 100.0, places=2)

        listed2 = self.client.get("/api/private/transactions")
        self.assertAlmostEqual(listed2.get_json()["total_balance"], 100.0, places=2)

        deleted = self.client.delete(f"/api/private/transactions/{tid}")
        self.assertEqual(deleted.status_code, 200)
        listed3 = self.client.get("/api/private/transactions")
        self.assertEqual(len(listed3.get_json()["transactions"]), 0)
        self.assertAlmostEqual(listed3.get_json()["total_balance"], 0.0, places=2)

    def test_transaction_post_unknown_group_forbidden(self):
        self._register_user()
        self._login_user()
        response = self.client.post(
            "/api/private/transactions",
            json={"amount": 10, "group_id": 424242},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
