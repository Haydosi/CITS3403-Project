import unittest
from datetime import datetime, timedelta, date, UTC

from app import create_app, db  # create_app/db used by the API test class added in Task 3
from app.models import SavingsTarget


def _target(target_amount=1000, current_amount=0, created_days_ago=10, deadline_in_days=100):
    """Build an unsaved SavingsTarget with dates relative to now."""
    now = datetime.now(UTC).replace(tzinfo=None)
    return SavingsTarget(
        user_id=1,
        name="Test Target",
        emoji="🎯",
        target_amount=target_amount,
        current_amount=current_amount,
        created_at=now - timedelta(days=created_days_ago),
        deadline=date.today() + timedelta(days=deadline_in_days),
    )


class SavingsTargetModelTest(unittest.TestCase):
    """Status and serialization logic — no database needed."""

    def test_status_completed_when_goal_reached(self):
        t = _target(target_amount=1000, current_amount=1000)
        self.assertEqual(t.status, "completed")

    def test_status_behind_when_deadline_passed_and_incomplete(self):
        t = _target(target_amount=1000, current_amount=100,
                    created_days_ago=30, deadline_in_days=-5)
        self.assertEqual(t.status, "behind")

    def test_status_on_track_when_progress_leads_time(self):
        t = _target(target_amount=1000, current_amount=600,
                    created_days_ago=1, deadline_in_days=100)
        self.assertEqual(t.status, "on-track")

    def test_status_at_risk_when_progress_slightly_lags_time(self):
        # ~30% of time elapsed, only 10% saved -> gap ~0.20 -> at-risk.
        t = _target(target_amount=1000, current_amount=100,
                    created_days_ago=30, deadline_in_days=70)
        self.assertEqual(t.status, "at-risk")

    def test_status_behind_when_progress_far_behind_time(self):
        # ~80% of time elapsed, only 10% saved -> gap ~0.70 -> behind.
        t = _target(target_amount=1000, current_amount=100,
                    created_days_ago=80, deadline_in_days=20)
        self.assertEqual(t.status, "behind")

    def test_progress_percentage_is_capped_at_100(self):
        t = _target(target_amount=1000, current_amount=1500)
        self.assertEqual(t.progress_percentage, 100.0)

    def test_to_dict_has_expected_keys(self):
        t = _target(target_amount=1000, current_amount=250)
        d = t.to_dict()
        for key in ("id", "user_id", "name", "emoji", "target_amount",
                    "current_amount", "deadline", "status",
                    "progress_percentage", "created_at", "updated_at"):
            self.assertIn(key, d)
        self.assertEqual(d["progress_percentage"], 25.0)

    def test_progress_percentage_is_zero_when_target_is_zero(self):
        t = _target(target_amount=0, current_amount=100)
        self.assertEqual(t.progress_percentage, 0.0)

    def test_status_handles_zero_target_without_error(self):
        t = _target(target_amount=0, current_amount=0,
                    created_days_ago=10, deadline_in_days=100)
        # Zero target -> progress_ratio 0 -> falls through to time-based status.
        self.assertIn(t.status, ("on-track", "at-risk", "behind"))


class _ApiTestConfig:
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    SECRET_KEY = "test-secret-key"


class SavingsTargetApiTest(unittest.TestCase):
    """API tests for the /api/private/targets endpoints."""

    def setUp(self):
        self.app = create_app(_ApiTestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _register_and_login(self, email="user@example.com", password="password123"):
        username = email.replace("@", "_").replace(".", "")
        self.client.post("/api/public/auth/register", json={
            "email": email, "username": username, "password": password, "confirm_password": password,
        })
        self.client.post("/api/public/auth/login", json={
            "email": email, "password": password,
        })

    def _create_target(self, name="Summer Trip", target_amount=2000,
                        deadline="2026-12-31", emoji="✈️"):
        return self.client.post("/api/private/targets", json={
            "name": name, "target_amount": target_amount,
            "deadline": deadline, "emoji": emoji,
        })

    def test_list_requires_authentication(self):
        response = self.client.get("/api/private/targets")
        self.assertEqual(response.status_code, 401)

    def test_list_returns_only_current_users_targets(self):
        self._register_and_login(email="a@example.com")
        self._create_target(name="A's Target")
        self.client.post("/api/public/auth/logout")
        self._register_and_login(email="b@example.com")
        self._create_target(name="B's Target")

        response = self.client.get("/api/private/targets")
        self.assertEqual(response.status_code, 200)
        names = [t["name"] for t in response.json["targets"]]
        self.assertEqual(names, ["B's Target"])

    def test_create_requires_authentication(self):
        response = self._create_target()
        self.assertEqual(response.status_code, 401)

    def test_create_success(self):
        self._register_and_login()
        response = self._create_target(name="New Laptop", target_amount=1500)
        self.assertEqual(response.status_code, 201)
        target = response.json["target"]
        self.assertEqual(target["name"], "New Laptop")
        self.assertEqual(target["target_amount"], 1500.0)
        self.assertEqual(target["current_amount"], 0.0)

    def test_create_rejects_blank_name(self):
        self._register_and_login()
        response = self._create_target(name="   ")
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_non_positive_amount(self):
        self._register_and_login()
        response = self._create_target(target_amount=0)
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_bad_deadline(self):
        self._register_and_login()
        response = self._create_target(deadline="not-a-date")
        self.assertEqual(response.status_code, 400)

    def test_update_success(self):
        self._register_and_login()
        target_id = self._create_target().json["target"]["id"]
        response = self.client.put(f"/api/private/targets/{target_id}", json={
            "name": "Renamed", "target_amount": 3000,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["target"]["name"], "Renamed")
        self.assertEqual(response.json["target"]["target_amount"], 3000.0)

    def test_update_other_users_target_returns_404(self):
        self._register_and_login(email="a@example.com")
        target_id = self._create_target().json["target"]["id"]
        self.client.post("/api/public/auth/logout")
        self._register_and_login(email="b@example.com")
        response = self.client.put(f"/api/private/targets/{target_id}", json={
            "name": "Hijacked",
        })
        self.assertEqual(response.status_code, 404)

    def test_update_rejects_non_positive_amount(self):
        self._register_and_login()
        target_id = self._create_target().json["target"]["id"]
        response = self.client.put(f"/api/private/targets/{target_id}", json={
            "target_amount": -5,
        })
        self.assertEqual(response.status_code, 400)

    def test_delete_success(self):
        self._register_and_login()
        target_id = self._create_target().json["target"]["id"]
        response = self.client.delete(f"/api/private/targets/{target_id}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["success"])
        self.assertEqual(self.client.get("/api/private/targets").json["targets"], [])

    def test_delete_other_users_target_returns_404(self):
        self._register_and_login(email="a@example.com")
        target_id = self._create_target().json["target"]["id"]
        self.client.post("/api/public/auth/logout")
        self._register_and_login(email="b@example.com")
        response = self.client.delete(f"/api/private/targets/{target_id}")
        self.assertEqual(response.status_code, 404)

    def test_contribute_adds_to_current_amount(self):
        self._register_and_login()
        target_id = self._create_target(target_amount=2000).json["target"]["id"]
        r1 = self.client.post(f"/api/private/targets/{target_id}/contribute",
                              json={"amount": 300})
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.json["target"]["current_amount"], 300.0)
        r2 = self.client.post(f"/api/private/targets/{target_id}/contribute",
                              json={"amount": 200})
        self.assertEqual(r2.json["target"]["current_amount"], 500.0)

    def test_contribute_rejects_non_positive_amount(self):
        self._register_and_login()
        target_id = self._create_target().json["target"]["id"]
        response = self.client.post(f"/api/private/targets/{target_id}/contribute",
                                    json={"amount": 0})
        self.assertEqual(response.status_code, 400)

    def test_contribute_other_users_target_returns_404(self):
        self._register_and_login(email="a@example.com")
        target_id = self._create_target().json["target"]["id"]
        self.client.post("/api/public/auth/logout")
        self._register_and_login(email="b@example.com")
        response = self.client.post(f"/api/private/targets/{target_id}/contribute",
                                    json={"amount": 100})
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
