import os
import random
import string
from datetime import datetime, timedelta, UTC, date

from app import db
from app.models import (
    User, Group, UserGroupMembership, GroupRole, Transaction,
    FamilyGroup, FamilyMember, FamilyTransaction, FamilyGoal,
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

EXPENSE_DESCS = [
    "Groceries", "Rent", "Electricity bill", "Internet", "Coffee",
    "Dining out", "Petrol", "Gym membership", "Streaming service", "Phone bill",
]

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

GOAL_OPTIONS = [
    ("Holiday Fund", 3000, 8000),
    ("New Car", 8000, 25000),
    ("Emergency Fund", 2000, 10000),
    ("Home Deposit", 15000, 50000),
    ("Christmas Fund", 500, 2000),
    ("Laptop Upgrade", 800, 2500),
]

# (name, emoji, target_amount, exact_current_for_test_user, days_until_deadline)
TARGET_OPTIONS = [
    ("Summer Trip", "✈️", 2000, 1400, 60),
    ("New Laptop", "💻", 1500, 820, 30),
    ("Emergency Fund", "🛡️", 5000, 3200, 240),
    ("Course Fee", "🎓", 800, 150, 8),
]


def _random_dt(months_back=6):
    now = datetime.now(UTC)
    start = now - timedelta(days=months_back * 30)
    return start + timedelta(seconds=random.randint(0, int((now - start).total_seconds())))


def _family_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


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

    # Random users
    users = [test_user]
    used = {("Test", "User")}
    for _ in range(20):
        while True:
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            if (first, last) not in used:
                used.add((first, last))
                break
        n = random.randint(1, 99)
        u = User(
            username=f"{first.lower()}{last.lower()}{n}",
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
    group_records = []   # (group, members) for the family pass below

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

    # --- Transactions (25 % chance of group_id for group members) ---
    for user in users:
        gid = user_group_map.get(user.id)
        for _ in range(random.randint(20, 50)):
            tx_type = random.choices(
                ["savings", "expense", "transfer"], weights=[50, 35, 15]
            )[0]
            if tx_type == "savings":
                amount = round(random.uniform(50, 2000), 2)
                desc = random.choice(SAVINGS_DESCS)
            elif tx_type == "expense":
                amount = round(random.uniform(-500, -10), 2)
                desc = random.choice(EXPENSE_DESCS)
            else:
                amount = round(random.uniform(100, 1000), 2)
                desc = random.choice(TRANSFER_DESCS)

            created = _random_dt(6)
            db.session.add(Transaction(
                user_id=user.id,
                group_id=gid if (gid and random.random() < 0.25) else None,
                amount=amount,
                description=desc,
                transaction_type=tx_type,
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

    # --- Pass 2: FamilyGroups, FamilyMembers, FamilyTransactions, FamilyGoals ---
    for group, members in group_records:
        owner = members[0]

        fg = FamilyGroup(
            global_group_id=group.id,
            group_name=group.group_name,
            owner_id=owner.id,
            family_code=_family_code(),
            member_count=len(members),
        )
        db.session.add(fg)
        db.session.flush()

        family_members = []
        for user in members:
            total = (
                db.session.query(db.func.sum(Transaction.amount))
                .filter(Transaction.user_id == user.id, Transaction.amount > 0)
                .scalar()
            ) or 0.0

            fm = FamilyMember(
                family_group_id=fg.id,
                global_user_id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                total_savings=round(total, 2),
            )
            db.session.add(fm)
            family_members.append((user, fm))

        db.session.flush()

        group_total = sum(fm.total_savings for _, fm in family_members)
        fg.total_savings = round(group_total, 2)
        for _, fm in family_members:
            fm.contribution_percentage = round(
                (fm.total_savings / group_total * 100) if group_total > 0 else 0, 2
            )

        db.session.flush()

        for user, fm in family_members:
            for tx in Transaction.query.filter_by(user_id=user.id).limit(10).all():
                db.session.add(FamilyTransaction(
                    family_group_id=fg.id,
                    family_member_id=fm.id,
                    amount=tx.amount,
                    description=tx.description,
                    transaction_type=tx.transaction_type,
                    recorded_at=tx.created_at,
                ))

        for goal_name, lo, hi in random.sample(GOAL_OPTIONS, random.randint(1, 2)):
            target = round(random.uniform(lo, hi), 2)
            current = round(random.uniform(0, target), 2)
            db.session.add(FamilyGoal(
                family_group_id=fg.id,
                goal_name=goal_name,
                target_amount=target,
                current_amount=current,
                deadline=date.today() + timedelta(days=random.randint(30, 365)),
                status="completed" if current >= target else "active",
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