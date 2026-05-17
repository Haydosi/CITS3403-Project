import os
import random
from datetime import datetime, timedelta, UTC, date

from app import db
from app.models import (
    User, Group, UserGroupMembership, GroupRole, Transaction,
    SavingsTarget,
)

FIRST_NAMES = [
    "Alice", "Bob", "Charlie", "Diana", "Ethan", "Fiona", "George", "Hannah",
    "Ivan", "Julia", "Kevin", "Laura", "Michael", "Nina", "Oscar", "Priya",
    "Quinn", "Rachel", "Samuel", "Tara",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Wilson", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris",
]

# Used to build display usernames that do NOT leak the seeded real names
# or emails. Pairs an adjective with an animal and a number suffix.
HANDLE_ADJECTIVES = [
    "frugal", "thrifty", "swift", "bright", "quiet", "bold", "gentle",
    "cosmic", "lucky", "sunny", "happy", "clever", "calm", "brave", "mellow",
]

HANDLE_ANIMALS = [
    "panda", "otter", "falcon", "koala", "wolf", "fox", "lynx", "tiger",
    "eagle", "puffin", "shark", "owl", "raven", "bison", "dolphin",
]

EXPENSE_DESCS = [
    "Groceries", "Rent", "Electricity bill", "Internet", "Coffee",
    "Dining out", "Petrol", "Gym membership", "Streaming service", "Phone bill",
]

# Pairs an expense description with the matching sub-category so the
# seeded Expense Breakdown chart shows realistic, varied slices.
EXPENSE_CATEGORY_BY_DESC = {
    "Groceries": "groceries",
    "Rent": "housing",
    "Electricity bill": "utilities",
    "Internet": "utilities",
    "Phone bill": "utilities",
    "Coffee": "food",
    "Dining out": "food",
    "Petrol": "transport",
    "Gym membership": "health",
    "Streaming service": "entertainment",
}

SAVINGS_DESCS = [
    "Monthly savings deposit", "Bonus saved", "Birthday money",
    "Tax refund", "Freelance payment", "Side project income", "Dividend",
]

TRANSFER_DESCS = [
    "Transfer to savings", "Emergency fund top-up", "Investment transfer",
]

GROUP_NAMES = [
    "The Frugal Five", "Perth Savers", "Budget Buddies", "Money Mindful", "Savings Squad",
]

# (name, emoji, target_amount, exact_current_for_test_user, days_until_deadline)
TARGET_OPTIONS = [
    ("Summer Trip", "✈️", 2000, 1400, 60),
    ("New Laptop", "💻", 1500, 820, 30),
    ("Emergency Fund", "🛡️", 5000, 3200, 240),
    ("Course Fee", "🎓", 800, 150, 8),
]


def _random_dt(months_back=6):
    # Weighted toward recent activity: ~50% in the last 30 days, ~30% in the
    # 1-3 month range, ~20% older. Keeps the dashboards / sparkline charts /
    # week-month leaderboard filters visibly populated instead of mostly empty.
    now = datetime.now(UTC)
    bucket = random.random()
    if bucket < 0.50:
        delta_days = random.uniform(0, 30)
    elif bucket < 0.80:
        delta_days = random.uniform(30, 90)
    else:
        delta_days = random.uniform(90, months_back * 30)
    return now - timedelta(
        days=delta_days,
        seconds=random.randint(0, 86399),
    )


def _recent_dt(days_back):
    # Uniform random datetime in the last `days_back` days. Used to seed
    # guaranteed-recent activity for demo charts.
    now = datetime.now(UTC)
    return now - timedelta(
        days=random.uniform(0, days_back),
        seconds=random.randint(0, 86399),
    )


TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "password123"


def seed_db():
    random.seed(42)

    # Fixed user with known credentials for automated tests
    test_user = User(
        username="testuser",
        email=TEST_EMAIL,
        first_name="Test",
        last_name="User",
    )
    test_user.set_password(TEST_PASSWORD)
    db.session.add(test_user)
    db.session.flush()

    # Random users. Usernames are intentionally generated independently of
    # the real first/last name so the leaderboard never reveals PII.
    users = [test_user]
    used_names = {("Test", "User")}
    used_usernames = {"testuser"}
    for _ in range(20):
        while True:
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            if (first, last) not in used_names:
                used_names.add((first, last))
                break
        while True:
            handle = f"{random.choice(HANDLE_ADJECTIVES)}{random.choice(HANDLE_ANIMALS)}{random.randint(1, 999)}"
            if handle not in used_usernames:
                used_usernames.add(handle)
                break
        n = random.randint(1, 99)
        u = User(
            username=handle,
            email=f"{first.lower()}.{last.lower()}{n}@example.com",
            first_name=first,
            last_name=last,
        )
        u.set_password("password123")
        db.session.add(u)
        users.append(u)

    db.session.flush()

    # --- Pass 1: groups + memberships, build user→group lookup ---
    # test_user excluded from pool so we can place them explicitly as group 1 owner
    pool = list(users[1:])
    random.shuffle(pool)

    user_group_map = {}  # user_id -> group_id (first group only, used for tx tagging)
    group_records = []   # collected (group, members) tuples for later seeding passes

    for i, group_name in enumerate(GROUP_NAMES):
        group = Group(group_name=group_name)
        db.session.add(group)
        db.session.flush()

        if i == 0:
            # test_user is always owner of the first group
            size = random.randint(3, min(7, len(pool)))
            members = [test_user] + pool[:size]
            pool = pool[size:]
        else:
            size = random.randint(4, min(8, len(pool)))
            members = pool[:size]
            pool = pool[size:]

        if len(pool) < 4:
            pool = list(users[1:])
            random.shuffle(pool)

        for j, user in enumerate(members):
            db.session.add(UserGroupMembership(
                user_id=user.id,
                group_id=group.id,
                user_role=GroupRole.OWNER if j == 0 else GroupRole.MEMBER,
            ))
            if user.id not in user_group_map:
                user_group_map[user.id] = group.id

        group_records.append((group, members))

    db.session.flush()

    # --- Transactions (25 % chance of group_id for savings/transfer rows) ---
    # Group-tagged transactions feed the group leaderboard and the per-group
    # sparkline chart. Expenses are intentionally NOT group-tagged so they
    # don't subtract from a group's "savings total".
    for user in users:
        gid = user_group_map.get(user.id)
        for _ in range(random.randint(20, 50)):
            tx_type = random.choices(
                ["savings", "expense", "transfer"], weights=[50, 35, 15]
            )[0]
            category = None
            if tx_type == "savings":
                amount = round(random.uniform(50, 2000), 2)
                desc = random.choice(SAVINGS_DESCS)
            elif tx_type == "expense":
                amount = round(random.uniform(-500, -10), 2)
                desc = random.choice(EXPENSE_DESCS)
                category = EXPENSE_CATEGORY_BY_DESC.get(desc, "other")
            else:
                amount = round(random.uniform(100, 1000), 2)
                desc = random.choice(TRANSFER_DESCS)

            created = _random_dt(6)
            in_group = gid and tx_type != "expense" and random.random() < 0.25
            db.session.add(Transaction(
                user_id=user.id,
                group_id=gid if in_group else None,
                amount=amount,
                description=desc,
                transaction_type=tx_type,
                category=category,
                created_at=created,
                updated_at=created,
            ))

    # Guaranteed recent group activity so the new 30-day sparkline chart on
    # the Groups page is visibly populated. Each group member gets 2-4
    # savings deposits spread across the last 21 days.
    for group, members in group_records:
        for user in members:
            for _ in range(random.randint(2, 4)):
                amount = round(random.uniform(80, 600), 2)
                created = _recent_dt(21)
                db.session.add(Transaction(
                    user_id=user.id,
                    group_id=group.id,
                    amount=amount,
                    description=random.choice(SAVINGS_DESCS),
                    transaction_type="savings",
                    category=None,
                    created_at=created,
                    updated_at=created,
                ))

    # Guaranteed last-7-days personal savings for the test user so the
    # "This week" leaderboard filter has visible content for them.
    for _ in range(3):
        amount = round(random.uniform(120, 480), 2)
        created = _recent_dt(7)
        db.session.add(Transaction(
            user_id=test_user.id,
            group_id=None,
            amount=amount,
            description=random.choice(SAVINGS_DESCS),
            transaction_type="savings",
            category=None,
            created_at=created,
            updated_at=created,
        ))

    db.session.flush()

    # --- Savings targets for all users ---
    # test_user keeps exact current_amount values so test assertions stay stable.
    # Random users get a randomised current_amount within [0, target_amount].
    for user in users:
        is_test = user.id == test_user.id
        days_back = 60 if is_test else random.randint(30, 90)
        target_created = datetime.now(UTC) - timedelta(days=days_back)

        for name, emoji, target_amt, exact_current, days_left in TARGET_OPTIONS:
            current_amt = exact_current if is_test else round(random.uniform(0, target_amt), 2)
            db.session.add(SavingsTarget(
                user_id=user.id,
                name=name,
                emoji=emoji,
                target_amount=target_amt,
                current_amount=current_amt,
                deadline=date.today() + timedelta(days=days_left),
                created_at=target_created,
                updated_at=target_created,
            ))

    db.session.flush()

    # Seed a handful of group-tagged expense rows so the Groups page exercises
    # the savings/spent/breakdown stats with real data.
    GROUP_EXPENSE_SAMPLES = [
        ("Groceries", "groceries", 45.0, 95.0),
        ("Pizza night", "food", 25.0, 60.0),
        ("Uber to airport", "transport", 30.0, 80.0),
        ("Power bill", "utilities", 80.0, 200.0),
        ("Movie tickets", "entertainment", 20.0, 50.0),
    ]
    for group, members in group_records:
        # ~3 group expenses per group, paid by random members.
        for _ in range(3):
            desc, cat, lo, hi = random.choice(GROUP_EXPENSE_SAMPLES)
            payer = random.choice(members)
            when = _recent_dt(30)
            db.session.add(Transaction(
                user_id=payer.id,
                group_id=group.id,
                amount=round(random.uniform(lo, hi), 2),
                description=desc,
                transaction_type="expense",
                category=cat,
                created_at=when,
                updated_at=when,
            ))

    db.session.commit()
    print(f"Seeded {len(users)} users across {len(GROUP_NAMES)} groups.")


def seed_if_empty():
    if User.query.count() > 0:
        return
    seed_db()


def auto_seed_if_debug(app):
    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        with app.app_context():
            seed_if_empty()