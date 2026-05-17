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

    def _register_user(self, email="user@example.com", password="password123", username=None):
        # Helper to register a user using the public API endpoint.
        if username is None:
            username = email.replace("@", "_").replace(".", "")
        return self.client.post(
            "/api/public/auth/register",
            json={
                "email": email,
                "username": username,
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
        mid = next(m["id"] for m in members if m["username"] == "m_mcom")
        rem = self.client.delete(f"/api/private/groups/{gid}/members/{mid}")
        self.assertEqual(rem.status_code, 200)
        lst2 = self.client.get("/api/private/groups").get_json()
        self.assertEqual(len(lst2["groups"][0]["members"]), 1)

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

    # ───────────────────────── bugfix/transactions regression tests ──

    def _create_group_with_owner(self, name="Test Group"):
        # Returns (group_id) after creating the group as the current user.
        return self.client.post(
            "/api/private/groups", json={"group_name": name}
        ).get_json()["group"]["id"]

    def test_category_rejected_for_non_expense(self):
        # Issue 2 regression — category is only valid on expense rows.
        self._register_user()
        self._login_user()
        r = self.client.post(
            "/api/private/transactions",
            json={
                "amount": 100,
                "transaction_type": "savings",
                "category": "food",
            },
        )
        self.assertEqual(r.status_code, 400, r.get_json())
        self.assertIn("category", r.get_json()["error"].lower())

    def test_invalid_category_rejected(self):
        # Issue 2 regression — only ALLOWED_EXPENSE_CATEGORIES are accepted.
        self._register_user()
        self._login_user()
        r = self.client.post(
            "/api/private/transactions",
            json={
                "amount": -20,
                "transaction_type": "expense",
                "category": "yachts",
            },
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("Invalid category", r.get_json()["error"])

    def test_category_cleared_when_type_patched_away_from_expense(self):
        # Issue 2 regression — switching off "expense" must drop the category.
        self._register_user()
        self._login_user()
        tid = self.client.post(
            "/api/private/transactions",
            json={
                "amount": -30,
                "transaction_type": "expense",
                "category": "food",
            },
        ).get_json()["transaction"]["id"]
        patched = self.client.patch(
            f"/api/private/transactions/{tid}",
            json={"transaction_type": "savings"},
        )
        self.assertEqual(patched.status_code, 200)
        self.assertIsNone(patched.get_json()["transaction"]["category"])

    def test_patch_invalid_category_does_not_mutate_row(self):
        # Issue D regression — validation failures must not leave the row in a
        # half-updated state. PATCH that flips type AND sets a bad category
        # should reject the whole request without mutating type.
        self._register_user()
        self._login_user()
        tid = self.client.post(
            "/api/private/transactions",
            json={
                "amount": -30,
                "transaction_type": "expense",
                "category": "food",
            },
        ).get_json()["transaction"]["id"]
        bad = self.client.patch(
            f"/api/private/transactions/{tid}",
            json={"transaction_type": "savings", "category": "food"},
        )
        # category is invalid on savings rows → 400, no mutation.
        self.assertEqual(bad.status_code, 400)
        listed = self.client.get("/api/private/transactions").get_json()
        row = listed["transactions"][0]
        self.assertEqual(row["transaction_type"], "expense")
        self.assertEqual(row["category"], "food")

    def test_personal_transactions_list_excludes_group_rows(self):
        # Issue 6 regression — group-tagged transactions must not show up in
        # the personal list or personal total_balance.
        self._register_user()
        self._login_user()
        gid = self._create_group_with_owner()
        # Personal row + group-tagged row.
        self.client.post(
            "/api/private/transactions",
            json={"amount": 100, "transaction_type": "savings"},
        )
        self.client.post(
            "/api/private/transactions",
            json={"amount": 500, "transaction_type": "savings", "group_id": gid},
        )
        body = self.client.get("/api/private/transactions").get_json()
        self.assertEqual(len(body["transactions"]), 1)
        self.assertAlmostEqual(body["total_balance"], 100.0, places=2)
        self.assertEqual(len(body.get("group_transactions") or []), 1)
        self.assertAlmostEqual(body["group_transactions"][0]["amount"], 500.0, places=2)

    def test_dashboard_summary_excludes_group_rows(self):
        # Issue 6 regression — dashboard summary is personal-only.
        self._register_user()
        self._login_user()
        gid = self._create_group_with_owner()
        self.client.post(
            "/api/private/transactions",
            json={"amount": 200, "transaction_type": "savings"},
        )
        self.client.post(
            "/api/private/transactions",
            json={"amount": 999, "transaction_type": "savings", "group_id": gid},
        )
        body = self.client.get("/api/private/dashboard/summary").get_json()
        self.assertAlmostEqual(body["total_balance"], 200.0, places=2)
        self.assertAlmostEqual(body["monthly_income"], 200.0, places=2)

    def test_dashboard_monthly_savings_only_counts_savings_type(self):
        # Issue 5 regression — monthly_savings is sum of savings-type rows,
        # not net cash flow (income − expense).
        self._register_user()
        self._login_user()
        # $1,000 income but logged as a transfer, and $300 in expenses. If the
        # old calculation came back, monthly_savings would be 700. With the
        # fix it should be 0 because there is no savings-type row.
        self.client.post(
            "/api/private/transactions",
            json={"amount": 1000, "transaction_type": "transfer"},
        )
        self.client.post(
            "/api/private/transactions",
            json={
                "amount": -300,
                "transaction_type": "expense",
                "category": "food",
            },
        )
        body = self.client.get("/api/private/dashboard/summary").get_json()
        self.assertAlmostEqual(body["monthly_savings"], 0.0, places=2)
        # Adding an explicit savings row should be the only contributor.
        self.client.post(
            "/api/private/transactions",
            json={"amount": 250, "transaction_type": "savings"},
        )
        body2 = self.client.get("/api/private/dashboard/summary").get_json()
        self.assertAlmostEqual(body2["monthly_savings"], 250.0, places=2)

    def test_dashboard_expense_breakdown_groups_by_category(self):
        # Issue 1 regression — breakdown is keyed by category, expenses only.
        self._register_user()
        self._login_user()
        self.client.post(
            "/api/private/transactions",
            json={
                "amount": -40,
                "transaction_type": "expense",
                "category": "food",
            },
        )
        self.client.post(
            "/api/private/transactions",
            json={
                "amount": -60,
                "transaction_type": "expense",
                "category": "food",
            },
        )
        self.client.post(
            "/api/private/transactions",
            json={
                "amount": -25,
                "transaction_type": "expense",
                "category": "transport",
            },
        )
        # Non-expense rows must not appear in the breakdown.
        self.client.post(
            "/api/private/transactions",
            json={"amount": 500, "transaction_type": "savings"},
        )
        body = self.client.get("/api/private/dashboard/summary").get_json()
        breakdown = {row["category"]: row["amount"] for row in body["expense_breakdown"]}
        self.assertIn("food", breakdown)
        self.assertIn("transport", breakdown)
        self.assertNotIn("savings", breakdown)
        self.assertAlmostEqual(breakdown["food"], 100.0, places=2)
        self.assertAlmostEqual(breakdown["transport"], 25.0, places=2)

    def test_global_leaderboard_excludes_group_rows(self):
        # Issue 6 regression — global leaderboard is personal-only savings.
        self._register_user()
        self._login_user()
        gid = self._create_group_with_owner()
        self.client.post(
            "/api/private/transactions",
            json={"amount": 100, "transaction_type": "savings"},
        )
        self.client.post(
            "/api/private/transactions",
            json={"amount": 9999, "transaction_type": "savings", "group_id": gid},
        )
        body = self.client.get("/api/private/leaderboard").get_json()
        # Owner is the only user with rows; total should ignore the group row.
        me = next(
            row for row in body["leaderboard"]
            if row["username"] == "user_examplecom"
        )
        self.assertAlmostEqual(float(me["total_saved"]), 100.0, places=2)

    def test_group_detail_payload_includes_expense_stats(self):
        self._register_user(email="owner@example.com")
        self._login_user(email="owner@example.com")
        gid = self.client.post(
            "/api/private/groups", json={"group_name": "Pot"}
        ).get_json()["group"]["id"]

        # Two savings (owner only) and two expenses across categories.
        self.client.post("/api/private/transactions", json={
            "amount": 100, "transaction_type": "savings", "group_id": gid,
        })
        self.client.post("/api/private/transactions", json={
            "amount": 50, "transaction_type": "savings", "group_id": gid,
        })
        self.client.post("/api/private/transactions", json={
            "amount": 30, "transaction_type": "expense", "category": "food",
            "group_id": gid,
        })
        self.client.post("/api/private/transactions", json={
            "amount": 20, "transaction_type": "expense", "category": "transport",
            "group_id": gid,
        })

        body = self.client.get("/api/private/groups").get_json()
        g = body["groups"][0]
        self.assertAlmostEqual(g["total_saved"], 150.0, places=2)
        self.assertAlmostEqual(g["total_spent"], 50.0, places=2)
        self.assertAlmostEqual(g["net_balance"], 100.0, places=2)
        self.assertAlmostEqual(g["month_saved"], 150.0, places=2)
        self.assertAlmostEqual(g["month_spent"], 50.0, places=2)
        breakdown = {row["category"]: row["amount"] for row in g["expense_breakdown"]}
        self.assertAlmostEqual(breakdown["food"], 30.0, places=2)
        self.assertAlmostEqual(breakdown["transport"], 20.0, places=2)

    def test_group_activity_returns_saved_and_spent_per_day(self):
        self._register_user(email="a@a.com")
        self._login_user(email="a@a.com")
        gid = self.client.post(
            "/api/private/groups", json={"group_name": "Act"}
        ).get_json()["group"]["id"]
        self.client.post("/api/private/transactions", json={
            "amount": 60, "transaction_type": "savings", "group_id": gid,
        })
        self.client.post("/api/private/transactions", json={
            "amount": 15, "transaction_type": "expense",
            "category": "food", "group_id": gid,
        })

        res = self.client.get(f"/api/private/groups/{gid}/activity")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["days"], 30)
        series = body["series"]
        self.assertEqual(len(series), 30)
        # Today's point (last in series) carries both numbers.
        last = series[-1]
        self.assertIn("date", last)
        self.assertIn("saved", last)
        self.assertIn("spent", last)
        self.assertAlmostEqual(last["saved"], 60.0, places=2)
        self.assertAlmostEqual(last["spent"], 15.0, places=2)
        # Earlier zero-filled days carry both zero fields.
        self.assertEqual(series[0]["saved"], 0.0)
        self.assertEqual(series[0]["spent"], 0.0)

    def test_group_transactions_requires_membership(self):
        self._register_user(email="o@o.com")
        self._login_user(email="o@o.com")
        gid = self.client.post(
            "/api/private/groups", json={"group_name": "Closed"}
        ).get_json()["group"]["id"]

        self._register_user(email="outsider@o.com")
        self._login_user(email="outsider@o.com")
        res = self.client.get(f"/api/private/groups/{gid}/transactions")
        self.assertEqual(res.status_code, 403)

    def test_group_transactions_returns_recent_rows_with_user(self):
        self._register_user(email="m@m.com")
        self._login_user(email="m@m.com")
        gid = self.client.post(
            "/api/private/groups", json={"group_name": "Tx"}
        ).get_json()["group"]["id"]
        self.client.post("/api/private/transactions", json={
            "amount": 12.5, "transaction_type": "expense",
            "category": "food", "description": "Lunch", "group_id": gid,
        })
        self.client.post("/api/private/transactions", json={
            "amount": 200, "transaction_type": "savings",
            "description": "Salary", "group_id": gid,
        })

        res = self.client.get(f"/api/private/groups/{gid}/transactions")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("transactions", body)
        self.assertEqual(len(body["transactions"]), 2)
        # Newest first.
        first = body["transactions"][0]
        self.assertEqual(first["transaction_type"], "savings")
        self.assertEqual(first["description"], "Salary")
        self.assertIn("user", first)
        self.assertEqual(first["user"]["username"], "m_mcom")

    def test_group_leaderboard_enabled_toggle_and_filter(self):
        self._register_user(email="owner@example.com")
        self._login_user(email="owner@example.com")
        g1 = self.client.post(
            "/api/private/groups", json={"group_name": "Alpha"}
        ).get_json()["group"]["id"]
        g2 = self.client.post(
            "/api/private/groups", json={"group_name": "Beta"}
        ).get_json()["group"]["id"]

        all_groups = self.client.get("/api/private/me/groups").get_json()["groups"]
        self.assertEqual(len(all_groups), 2)

        lb_groups = self.client.get(
            "/api/private/me/groups?leaderboard=1"
        ).get_json()["groups"]
        self.assertEqual(len(lb_groups), 2)

        off = self.client.patch(
            f"/api/private/groups/{g2}",
            json={"leaderboard_enabled": False},
        )
        self.assertEqual(off.status_code, 200)
        self.assertFalse(off.get_json()["group"]["leaderboard_enabled"])

        lb_groups = self.client.get(
            "/api/private/me/groups?leaderboard=1"
        ).get_json()["groups"]
        self.assertEqual(len(lb_groups), 1)
        self.assertEqual(lb_groups[0]["id"], g1)

        blocked = self.client.get(f"/api/private/leaderboard/group/{g2}")
        self.assertEqual(blocked.status_code, 403)

        ok = self.client.get(f"/api/private/leaderboard/group/{g1}")
        self.assertEqual(ok.status_code, 200)

    def test_member_cannot_toggle_group_leaderboard(self):
        self._register_user(email="owner@example.com")
        self._login_user(email="owner@example.com")
        gid = self.client.post(
            "/api/private/groups", json={"group_name": "Fam"}
        ).get_json()["group"]["id"]
        self._register_user(email="member@example.com", password="password123")
        self._login_user(email="owner@example.com", password="password123")
        self.client.post(
            f"/api/private/groups/{gid}/members",
            json={"email": "member@example.com"},
        )
        self._login_user(email="member@example.com", password="password123")
        res = self.client.patch(
            f"/api/private/groups/{gid}",
            json={"leaderboard_enabled": False},
        )
        self.assertEqual(res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
