import math
from datetime import datetime, timedelta, UTC

from flask import Blueprint, request, jsonify
from flask_login import current_user, login_user, logout_user
from sqlalchemy import func
from app import db
from app.models import (
    User,
    Transaction,
    UserGroupMembership,
    Group,
    GroupRole,
    SavingsTarget,
)

# Public API routes are intended for external or unauthenticated clients.
# These endpoints can be consumed by frontend forms or third-party apps.
public_api = Blueprint("public_api", __name__, url_prefix="/api/public")

# Private API routes require authentication and are for internal app use.
private_api = Blueprint("private_api", __name__, url_prefix="/api/private")


def json_error(message, status=400):
    # Standardize JSON error responses with a message and status code.
    return jsonify(error=message), status


def require_json_payload():
    # Parse JSON payload from the request body.
    payload = request.get_json(silent=True)
    if payload is None:
        return None, json_error("Request must be JSON", 400)
    return payload, None


def _parse_positive_number(value):
    # Parse a value into a float that must be strictly positive.
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number <= 0:
        return None
    return number


def _parse_date(value):
    # Parse an ISO YYYY-MM-DD string into a date.
    from datetime import date
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _get_owned_target(target_id):
    # Load a savings target only if it belongs to the current user.
    target = db.session.get(SavingsTarget, target_id)
    if target is None or target.user_id != current_user.id:
        return None
    return target


def mc_pmt(rate, nper, pv):
    # Calculate fixed periodic payment for a loan.
    if rate == 0:
        return pv / nper
    term = (1.0 + rate) ** nper
    return pv * rate * term / (term - 1)


def mc_pv(rate, nper, pmt):
    # Calculate the present value (maximum principal) for a payment amount.
    if rate == 0:
        return pmt * nper
    term = (1.0 + rate) ** nper
    return pmt * (term - 1) / (rate * term)


def mc_nper(rate, pmt, pv):
    # Calculate the number of periods required to repay a loan.
    if rate == 0:
        return pv / pmt
    denominator = pmt - rate * pv
    if denominator <= 0:
        return None
    return math.log(pmt / denominator) / math.log(1.0 + rate)


@public_api.route("/auth/login", methods=["POST"])
def api_login():
    # Public login endpoint.
    payload, error = require_json_payload()
    if error:
        return error

    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        return json_error("Email and password are required", 400)

    user = User.query.filter_by(email=email).first()
    if user is None or not user.check_password(password):
        return json_error("Invalid email or password", 401)

    login_user(user)
    return jsonify(success=True, user=user.to_dict())


@public_api.route("/auth/register", methods=["POST"])
def api_register():
    # Public registration endpoint.
    payload, error = require_json_payload()
    if error:
        return error

    email = payload.get("email")
    password = payload.get("password")
    confirm_password = payload.get("confirm_password")
    if not email or not password or not confirm_password:
        return json_error("Email, password and confirm_password are required", 400)
    if password != confirm_password:
        return json_error("Passwords must match", 400)
    if User.query.filter_by(email=email).first():
        return json_error("An account with that email already exists", 409)

    user = User(email=email, username=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify(success=True, user=user.to_dict()), 201


@private_api.route("/auth/logout", methods=["POST", "GET"])
@public_api.route("/auth/logout", methods=["POST", "GET"])
def api_logout():
    # Logout can be called from either public or private endpoints.
    if current_user.is_authenticated:
        logout_user()
    return jsonify(success=True)


@private_api.route("/auth/user", methods=["GET"])
def api_current_user():
    # Private endpoint to return the current authenticated user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    return jsonify(user=current_user.to_dict())


@private_api.route("/users", methods=["GET"])
def api_users():
    # Private endpoint to list all users.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    users = User.query.order_by(User.id.asc()).all()
    return jsonify(users=[user.to_dict() for user in users])


@private_api.route("/users/<int:user_id>", methods=["GET"])
def api_user_detail(user_id):
    # Private endpoint to return a single user by id.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    user = User.query.get(user_id)
    if user is None:
        return json_error("User not found", 404)
    return jsonify(user=user.to_dict())


@private_api.route("/dashboard", methods=["GET"])
def api_dashboard():
    # Private dashboard summary endpoint.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    latest_users = [u.to_dict() for u in User.query.order_by(User.created_at.desc()).limit(5).all()]
    return jsonify(total_users=total_users, active_users=active_users, latest_users=latest_users)


def _window_cutoff(raw):
    # Map ?window= values to a datetime cutoff (or None for all-time).
    value = (raw or "all").lower()
    now = datetime.now(UTC)
    if value == "week":
        return now - timedelta(days=7)
    if value == "month":
        return datetime(now.year, now.month, 1, tzinfo=UTC)
    return None


@private_api.route("/leaderboard", methods=["GET"])
def api_leaderboard():
    # Private leaderboard endpoint - returns top savers globally.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)

    window = (request.args.get("window") or "all").lower()
    cutoff = _window_cutoff(window)

    # Global leaderboard ranks users on personal-only savings — group-tagged
    # rows are scored in the family leaderboard instead (see Issue 6).
    txn_filter = (User.id == Transaction.user_id) & (Transaction.group_id.is_(None))
    if cutoff is not None:
        txn_filter = txn_filter & (Transaction.created_at >= cutoff)

    leaderboard_query = db.session.query(
        User.id,
        User.username,
        User.email,
        User.first_name,
        User.last_name,
        func.coalesce(func.sum(Transaction.amount), 0).label('total_saved')
    ).outerjoin(Transaction, txn_filter).group_by(User.id).order_by(
        func.coalesce(func.sum(Transaction.amount), 0).desc()
    ).limit(50)

    leaderboard = []
    for user_id, username, email, first_name, last_name, total_saved in leaderboard_query:
        leaderboard.append({
            "id": user_id,
            "username": username,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "total_saved": float(total_saved) if total_saved else 0,
        })

    return jsonify(leaderboard=leaderboard, window=window)


@private_api.route("/leaderboard/group/<int:group_id>", methods=["GET"])
def api_group_leaderboard(group_id):
    # Private family leaderboard endpoint - returns top savers in a specific family group.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)

    window = (request.args.get("window") or "all").lower()
    cutoff = _window_cutoff(window)

    txn_filter = (User.id == Transaction.user_id) & (Transaction.group_id == group_id)
    if cutoff is not None:
        txn_filter = txn_filter & (Transaction.created_at >= cutoff)

    # Include all group members, even if they have no transactions in that group.
    leaderboard_query = db.session.query(
        User.id,
        User.username,
        User.email,
        User.first_name,
        User.last_name,
        func.coalesce(func.sum(Transaction.amount), 0).label('total_saved')
    ).join(
        UserGroupMembership, User.id == UserGroupMembership.user_id
    ).filter(
        UserGroupMembership.group_id == group_id
    ).outerjoin(Transaction, txn_filter).group_by(
        User.id,
        User.username,
        User.email,
        User.first_name,
        User.last_name
    ).order_by(
        func.coalesce(func.sum(Transaction.amount), 0).desc()
    )

    leaderboard = _family_leaderboard_payload(leaderboard_query)

    return jsonify(leaderboard=leaderboard, window=window)


@private_api.route("/groups/<int:group_id>/activity", methods=["GET"])
def api_group_activity(group_id):
    # Daily group-tagged savings for the last 30 days. Used for the
    # per-group sparkline chart on the Groups page.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    if _membership(current_user.id, group_id) is None:
        return json_error("Not a member of this group", 403)
    return jsonify(group_id=group_id, days=30, series=_group_activity_series(group_id, days=30))


@private_api.route("/targets", methods=["GET"])
def api_targets_list():
    # List the current user's savings targets, newest first.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    targets = (
        SavingsTarget.query
        .filter_by(user_id=current_user.id)
        .order_by(SavingsTarget.created_at.desc())
        .all()
    )
    return jsonify(targets=[t.to_dict() for t in targets])


@private_api.route("/targets", methods=["POST"])
def api_targets_create():
    # Create a savings target owned by the current user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    payload, error = require_json_payload()
    if error:
        return error

    name = (payload.get("name") or "").strip()
    if not name or len(name) > 100:
        return json_error("A target name (1-100 characters) is required", 400)

    target_amount = _parse_positive_number(payload.get("target_amount"))
    if target_amount is None:
        return json_error("target_amount must be a positive number", 400)

    deadline = _parse_date(payload.get("deadline"))
    if deadline is None:
        return json_error("deadline must be a valid YYYY-MM-DD date", 400)

    emoji = (payload.get("emoji") or "🎯").strip() or "🎯"

    target = SavingsTarget(
        user_id=current_user.id,
        name=name,
        emoji=emoji,
        target_amount=target_amount,
        current_amount=0,
        deadline=deadline,
    )
    db.session.add(target)
    db.session.commit()
    return jsonify(target=target.to_dict()), 201


@private_api.route("/targets/<int:target_id>", methods=["PUT"])
def api_targets_update(target_id):
    # Update fields of a savings target owned by the current user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    target = _get_owned_target(target_id)
    if target is None:
        return json_error("Target not found", 404)
    payload, error = require_json_payload()
    if error:
        return error

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name or len(name) > 100:
            return json_error("A target name (1-100 characters) is required", 400)
        target.name = name

    if "target_amount" in payload:
        target_amount = _parse_positive_number(payload.get("target_amount"))
        if target_amount is None:
            return json_error("target_amount must be a positive number", 400)
        target.target_amount = target_amount

    if "deadline" in payload:
        deadline = _parse_date(payload.get("deadline"))
        if deadline is None:
            return json_error("deadline must be a valid YYYY-MM-DD date", 400)
        target.deadline = deadline

    if "emoji" in payload:
        target.emoji = (payload.get("emoji") or "🎯").strip() or "🎯"

    db.session.commit()
    return jsonify(target=target.to_dict())


@private_api.route("/targets/<int:target_id>", methods=["DELETE"])
def api_targets_delete(target_id):
    # Delete a savings target owned by the current user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    target = _get_owned_target(target_id)
    if target is None:
        return json_error("Target not found", 404)
    db.session.delete(target)
    db.session.commit()
    return jsonify(success=True)


@private_api.route("/targets/<int:target_id>/contribute", methods=["POST"])
def api_targets_contribute(target_id):
    # Add a positive contribution to a savings target's current_amount.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    target = _get_owned_target(target_id)
    if target is None:
        return json_error("Target not found", 404)
    payload, error = require_json_payload()
    if error:
        return error

    amount = _parse_positive_number(payload.get("amount"))
    if amount is None:
        return json_error("amount must be a positive number", 400)

    target.current_amount = float(target.current_amount or 0) + amount
    db.session.commit()
    return jsonify(target=target.to_dict())


@public_api.route("/debt/loan/repayments", methods=["POST"])
def api_debt_loan_repayments():
    # Public loan repayment calculator endpoint.
    payload, error = require_json_payload()
    if error:
        return error

    amount = payload.get("amount")
    rate = payload.get("rate")
    term = payload.get("term")
    freq = payload.get("freq")
    fee = payload.get("fee", 0)
    fee_freq = payload.get("fee_freq", 1)

    if amount is None or rate is None or term is None or freq is None:
        return json_error("amount, rate, term and freq are required", 400)

    try:
        amount = float(amount)
        rate = float(rate)
        term = int(term)
        freq = int(freq)
        fee = float(fee)
        fee_freq = int(fee_freq)
    except (TypeError, ValueError):
        return json_error("Invalid numeric input", 400)

    if amount <= 0 or rate < 0 or term <= 0 or freq <= 0:
        return json_error("amount, term and freq must be positive and rate must be non-negative", 400)

    period_rate = (rate / 100.0) / freq
    nper = term * freq
    fees_per_period = (fee * fee_freq) / freq
    payment = mc_pmt(period_rate, nper, amount) + fees_per_period
    total_paid = payment * nper
    total_interest = total_paid - amount

    return jsonify(
        payment=round(payment, 2),
        total_paid=round(total_paid, 2),
        total_interest=round(total_interest, 2),
        principal=round(amount, 2),
        periods=nper,
        frequency=freq,
        rate=rate,
    )


@public_api.route("/debt/loan/borrow", methods=["POST"])
def api_debt_loan_borrow():
    # Public borrowing capacity endpoint.
    payload, error = require_json_payload()
    if error:
        return error

    payment = payload.get("payment")
    rate = payload.get("rate")
    term = payload.get("term")
    freq = payload.get("freq")
    fee = payload.get("fee", 0)
    fee_freq = payload.get("fee_freq", 1)

    if payment is None or rate is None or term is None or freq is None:
        return json_error("payment, rate, term and freq are required", 400)

    try:
        payment = float(payment)
        rate = float(rate)
        term = int(term)
        freq = int(freq)
        fee = float(fee)
        fee_freq = int(fee_freq)
    except (TypeError, ValueError):
        return json_error("Invalid numeric input", 400)

    if payment <= 0 or rate < 0 or term <= 0 or freq <= 0:
        return json_error("payment, term and freq must be positive and rate must be non-negative", 400)

    period_rate = (rate / 100.0) / freq
    nper = term * freq
    fees_per_period = (fee * fee_freq) / freq
    net_payment = payment - fees_per_period
    if net_payment <= 0:
        return json_error("Payment must be larger than fees per period", 400)

    principal = mc_pv(period_rate, nper, net_payment)
    if principal <= 0:
        return json_error("Unable to compute borrowing capacity with provided inputs", 400)

    total_paid = payment * nper
    total_interest = total_paid - principal
    return jsonify(
        principal=round(principal, 2),
        total_paid=round(total_paid, 2),
        total_interest=round(total_interest, 2),
        payment=round(payment, 2),
        periods=nper,
        frequency=freq,
        rate=rate,
    )


@public_api.route("/debt/loan/sooner", methods=["POST"])
def api_debt_loan_sooner():
    # Public loan payoff estimator endpoint.
    payload, error = require_json_payload()
    if error:
        return error

    amount = payload.get("amount")
    payment = payload.get("payment")
    rate = payload.get("rate")
    freq = payload.get("freq")
    fee = payload.get("fee", 0)
    fee_freq = payload.get("fee_freq", 1)

    if amount is None or payment is None or rate is None or freq is None:
        return json_error("amount, payment, rate and freq are required", 400)

    try:
        amount = float(amount)
        payment = float(payment)
        rate = float(rate)
        freq = int(freq)
        fee = float(fee)
        fee_freq = int(fee_freq)
    except (TypeError, ValueError):
        return json_error("Invalid numeric input", 400)

    if amount <= 0 or payment <= 0 or rate < 0 or freq <= 0:
        return json_error("amount, payment and freq must be positive and rate must be non-negative", 400)

    period_rate = (rate / 100.0) / freq
    fees_per_period = (fee * fee_freq) / freq
    net_payment = payment - fees_per_period
    if net_payment <= period_rate * amount:
        return json_error("Repayment is too low to cover interest", 400)

    nperiods = mc_nper(period_rate, net_payment, amount)
    if nperiods is None:
        return json_error("Repayment is too low to cover interest", 400)

    total_paid = payment * nperiods
    total_interest = total_paid - amount
    years = int(nperiods // freq)
    months = int(math.ceil((nperiods / freq - years) * 12))
    return jsonify(
        periods=round(nperiods, 2),
        years=years,
        months=months,
        total_paid=round(total_paid, 2),
        total_interest=round(total_interest, 2),
        amount=round(amount, 2),
        payment=round(payment, 2),
        rate=rate,
        frequency=freq,
    )


def _family_leaderboard_payload(leaderboard_query):
    # Build JSON rows for the family leaderboard query (user + totals per group).
    rows = []
    for user_id, username, email, first_name, last_name, total_saved in leaderboard_query:
        rows.append(
            {
                "id": user_id,
                "username": username,
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "total_saved": float(total_saved) if total_saved else 0,
            }
        )
    return rows


ALLOWED_TRANSACTION_TYPES = frozenset({"savings", "expense", "transfer"})

# Sub-categories valid only for expense-type transactions. Stored on
# Transaction.category and surfaced in the Expense Breakdown chart.
ALLOWED_EXPENSE_CATEGORIES = frozenset({
    "food",
    "groceries",
    "transport",
    "housing",
    "utilities",
    "entertainment",
    "health",
    "shopping",
    "other",
})


def _normalise_category(raw, tx_type):
    # Empty/None for non-expense rows. Returns (value, error_message).
    if raw in (None, ""):
        return None, None
    value = str(raw).strip().lower()
    if not value:
        return None, None
    if tx_type != "expense":
        return None, "category is only valid for expense transactions"
    if value not in ALLOWED_EXPENSE_CATEGORIES:
        return None, "Invalid category"
    return value, None


def _user_in_group(user_id, group_id):
    # True if the user belongs to the given group.
    return (
        UserGroupMembership.query.filter_by(
            user_id=user_id, group_id=group_id
        ).first()
        is not None
    )


def _parse_optional_group_id(raw):
    # None = no group; "invalid" = bad input; int = group id.
    if raw in (None, "", 0, "0"):
        return None
    try:
        gid = int(raw)
    except (TypeError, ValueError):
        return "invalid"
    if gid < 1:
        return "invalid"
    return gid


def _transaction_to_json(transaction, group_name=None):
    # Serialize a transaction for JSON, optionally including the group label.
    data = transaction.to_dict()
    amt = data.get("amount")
    if amt is not None:
        data["amount"] = float(amt)
    if group_name is not None:
        data["group_name"] = group_name
    return data


@private_api.route("/me/groups", methods=["GET"])
def api_my_groups():
    # Groups the current user belongs to (for transaction forms).
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    groups = (
        Group.query.join(
            UserGroupMembership, UserGroupMembership.group_id == Group.id
        )
        .filter(UserGroupMembership.user_id == current_user.id)
        .order_by(Group.group_name.asc())
        .all()
    )
    return jsonify(groups=[g.to_dict() for g in groups])


@private_api.route("/transactions", methods=["GET", "POST"])
def api_transactions():
    # List or create transactions for the logged-in user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)

    if request.method == "GET":
        # Personal queries exclude group-tagged rows — those only count in the
        # group/family context (see Issue 6).
        total_balance = (
            db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.group_id.is_(None),
            )
            .scalar()
        )
        rows = (
            db.session.query(Transaction, Group.group_name)
            .outerjoin(Group, Transaction.group_id == Group.id)
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.group_id.is_(None),
            )
            .order_by(Transaction.created_at.desc())
            .limit(200)
            .all()
        )
        return jsonify(
            transactions=[
                _transaction_to_json(tx, gname) for tx, gname in rows
            ],
            total_balance=float(total_balance) if total_balance else 0.0,
        )

    payload, error = require_json_payload()
    if error:
        return error

    amount = payload.get("amount")
    if amount is None:
        return json_error("amount is required", 400)
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return json_error("Invalid amount", 400)

    tx_type = (payload.get("transaction_type") or "savings").strip().lower()
    if tx_type not in ALLOWED_TRANSACTION_TYPES:
        return json_error("Invalid transaction_type", 400)

    desc = payload.get("description")
    if desc is not None:
        desc = str(desc).strip()[:255] or None

    category, cat_err = _normalise_category(payload.get("category"), tx_type)
    if cat_err:
        return json_error(cat_err, 400)

    group_id = _parse_optional_group_id(payload.get("group_id"))
    if group_id == "invalid":
        return json_error("Invalid group_id", 400)
    if group_id is not None and not _user_in_group(current_user.id, group_id):
        return json_error("You are not a member of that group", 403)

    tx = Transaction(
        user_id=current_user.id,
        group_id=group_id,
        amount=amount,
        description=desc,
        transaction_type=tx_type,
        category=category,
    )
    db.session.add(tx)
    db.session.commit()
    gname = None
    if group_id:
        g = Group.query.get(group_id)
        gname = g.group_name if g else None
    return jsonify(transaction=_transaction_to_json(tx, gname)), 201


@private_api.route("/transactions/<int:transaction_id>", methods=["PATCH", "DELETE"])
def api_transaction_detail(transaction_id):
    # Update or delete a single transaction owned by the current user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)

    tx = Transaction.query.filter_by(
        id=transaction_id, user_id=current_user.id
    ).first()
    if tx is None:
        return json_error("Transaction not found", 404)

    if request.method == "DELETE":
        db.session.delete(tx)
        db.session.commit()
        return jsonify(success=True)

    payload, error = require_json_payload()
    if error:
        return error

    # Validate all fields before mutating the session — a failure halfway through
    # would otherwise leave the row partially updated for the rest of the request.
    UNSET = object()
    new_amount = UNSET
    new_description = UNSET
    new_type = UNSET
    new_category = UNSET
    new_group_id = UNSET

    if "amount" in payload:
        if payload["amount"] is None:
            return json_error("amount cannot be null", 400)
        try:
            new_amount = float(payload["amount"])
        except (TypeError, ValueError):
            return json_error("Invalid amount", 400)

    if "description" in payload:
        d = payload.get("description")
        if d is None:
            new_description = None
        else:
            d = str(d).strip()[:255]
            new_description = d or None

    if "transaction_type" in payload:
        tt = (payload.get("transaction_type") or "").strip().lower()
        if tt not in ALLOWED_TRANSACTION_TYPES:
            return json_error("Invalid transaction_type", 400)
        new_type = tt

    # Category is validated against the post-PATCH type so a request that
    # changes type AND category in one go is checked against the new type.
    effective_type = new_type if new_type is not UNSET else tx.transaction_type
    if "category" in payload:
        category, cat_err = _normalise_category(
            payload.get("category"), effective_type
        )
        if cat_err:
            return json_error(cat_err, 400)
        new_category = category

    if "group_id" in payload:
        raw = payload.get("group_id")
        if raw in (None, "", 0, "0"):
            new_group_id = None
        else:
            group_id = _parse_optional_group_id(raw)
            if group_id == "invalid":
                return json_error("Invalid group_id", 400)
            if not _user_in_group(current_user.id, group_id):
                return json_error("You are not a member of that group", 403)
            new_group_id = group_id

    if new_amount is not UNSET:
        tx.amount = new_amount
    if new_description is not UNSET:
        tx.description = new_description
    if new_type is not UNSET:
        tx.transaction_type = new_type
        # Category only applies to expense rows — clear it if the type changed.
        if new_type != "expense" and new_category is UNSET:
            tx.category = None
    if new_category is not UNSET:
        tx.category = new_category
    if new_group_id is not UNSET:
        tx.group_id = new_group_id

    db.session.commit()
    gname = None
    if tx.group_id:
        g = Group.query.get(tx.group_id)
        gname = g.group_name if g else None
    return jsonify(transaction=_transaction_to_json(tx, gname))


def _membership(user_id, group_id):
    return UserGroupMembership.query.filter_by(
        user_id=user_id, group_id=group_id
    ).first()


def _user_public_summary(u):
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
    }


def _group_detail_payload(group_id, my_membership):
    g = Group.query.get(group_id)
    if g is None:
        return None
    rows = UserGroupMembership.query.filter_by(group_id=group_id).order_by(
        UserGroupMembership.id.asc()
    ).all()

    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)

    # Per-user savings totals (used for member contribution + top_contributor).
    savings_by_user = dict(
        db.session.query(
            Transaction.user_id,
            func.coalesce(func.sum(Transaction.amount), 0),
        )
        .filter(
            Transaction.group_id == group_id,
            Transaction.transaction_type == "savings",
        )
        .group_by(Transaction.user_id)
        .all()
    )
    month_savings_by_user = dict(
        db.session.query(
            Transaction.user_id,
            func.coalesce(func.sum(Transaction.amount), 0),
        )
        .filter(
            Transaction.group_id == group_id,
            Transaction.transaction_type == "savings",
            Transaction.created_at >= month_start,
        )
        .group_by(Transaction.user_id)
        .all()
    )

    # Group-level expense totals.
    total_spent = float(
        db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.group_id == group_id,
            Transaction.transaction_type == "expense",
        )
        .scalar()
        or 0
    )
    month_spent = float(
        db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.group_id == group_id,
            Transaction.transaction_type == "expense",
            Transaction.created_at >= month_start,
        )
        .scalar()
        or 0
    )

    # Expense breakdown by category, sorted descending.
    breakdown_rows = (
        db.session.query(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), 0),
        )
        .filter(
            Transaction.group_id == group_id,
            Transaction.transaction_type == "expense",
        )
        .group_by(Transaction.category)
        .all()
    )
    expense_breakdown = sorted(
        [
            {"category": cat or "other", "amount": round(float(amt or 0), 2)}
            for cat, amt in breakdown_rows
        ],
        key=lambda r: r["amount"],
        reverse=True,
    )

    members = []
    group_total_savings = 0.0
    top_contrib = None
    for m in rows:
        u = User.query.get(m.user_id)
        if u is None:
            continue
        entry = _user_public_summary(u)
        entry["user_role"] = m.user_role.value if m.user_role else None
        entry["membership_id"] = m.id
        member_total = float(savings_by_user.get(m.user_id, 0) or 0)
        entry["total_saved"] = round(member_total, 2)
        entry["month_saved"] = round(
            float(month_savings_by_user.get(m.user_id, 0) or 0), 2
        )
        group_total_savings += member_total
        if top_contrib is None or member_total > top_contrib["total_saved"]:
            top_contrib = {
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "username": u.username,
                "total_saved": member_total,
            }
        members.append(entry)

    for entry in members:
        entry["share_pct"] = (
            round(entry["total_saved"] / group_total_savings * 100, 1)
            if group_total_savings > 0
            else 0.0
        )

    month_total_savings = sum(
        float(v or 0) for v in month_savings_by_user.values()
    )

    return {
        **g.to_dict(),
        "my_role": my_membership.user_role.value if my_membership.user_role else None,
        "member_count": len(members),
        "members": members,
        "total_saved": round(group_total_savings, 2),
        "month_saved": round(month_total_savings, 2),
        "total_spent": round(total_spent, 2),
        "month_spent": round(month_spent, 2),
        "net_balance": round(group_total_savings - total_spent, 2),
        "expense_breakdown": expense_breakdown,
        "top_contributor": top_contrib,
    }


def _group_activity_series(group_id, days=30):
    # Daily group-tagged savings and expenses for the last N days. Zero-filled.
    now = datetime.now(UTC)
    start = datetime(now.year, now.month, now.day, tzinfo=UTC) - timedelta(
        days=days - 1
    )

    def _by_day(tx_type):
        rows = (
            db.session.query(
                func.date(Transaction.created_at).label("d"),
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .filter(
                Transaction.group_id == group_id,
                Transaction.transaction_type == tx_type,
                Transaction.created_at >= start,
            )
            .group_by(func.date(Transaction.created_at))
            .all()
        )
        return {str(r[0]): float(r[1] or 0) for r in rows}

    saved_by_day = _by_day("savings")
    spent_by_day = _by_day("expense")

    series = []
    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        series.append({
            "date": day,
            "saved": round(saved_by_day.get(day, 0.0), 2),
            "spent": round(spent_by_day.get(day, 0.0), 2),
        })
    return series


def _promote_next_owner(group_id, leaving_user_id):
    nxt = (
        UserGroupMembership.query.filter(
            UserGroupMembership.group_id == group_id,
            UserGroupMembership.user_id != leaving_user_id,
        )
        .order_by(UserGroupMembership.id.asc())
        .first()
    )
    if nxt is not None:
        nxt.user_role = GroupRole.OWNER


def _maybe_prune_empty_group(group_id):
    if UserGroupMembership.query.filter_by(group_id=group_id).count() > 0:
        return
    Transaction.query.filter_by(group_id=group_id).update(
        {Transaction.group_id: None}, synchronize_session=False
    )
    Group.query.filter_by(id=group_id).delete(synchronize_session=False)


@private_api.route("/groups", methods=["GET", "POST"])
def api_groups():
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)

    if request.method == "GET":
        mine = UserGroupMembership.query.filter_by(
            user_id=current_user.id
        ).all()
        out = []
        for m in mine:
            payload = _group_detail_payload(m.group_id, m)
            if payload:
                out.append(payload)
        return jsonify(groups=out)

    payload, error = require_json_payload()
    if error:
        return error
    raw_name = payload.get("group_name")
    if raw_name is None or not str(raw_name).strip():
        return json_error("group_name is required", 400)
    name = str(raw_name).strip()[:50]
    g = Group(group_name=name)
    db.session.add(g)
    db.session.flush()
    mem = UserGroupMembership(
        user_id=current_user.id,
        group_id=g.id,
        user_role=GroupRole.OWNER,
    )
    db.session.add(mem)
    db.session.commit()
    return jsonify(group=_group_detail_payload(g.id, mem)), 201


@private_api.route("/groups/<int:group_id>", methods=["PATCH"])
def api_group_rename(group_id):
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    actor = _membership(current_user.id, group_id)
    if actor is None:
        return json_error("Not a member of this group", 403)
    if actor.user_role not in (GroupRole.OWNER, GroupRole.ADMIN):
        return json_error("Only owners and admins can rename the group", 403)

    payload, error = require_json_payload()
    if error:
        return error
    raw_name = payload.get("group_name")
    if raw_name is None or not str(raw_name).strip():
        return json_error("group_name is required", 400)
    g = Group.query.get(group_id)
    if g is None:
        return json_error("Group not found", 404)
    g.group_name = str(raw_name).strip()[:50]
    db.session.commit()
    return jsonify(group=_group_detail_payload(group_id, actor))


@private_api.route("/groups/<int:group_id>/members", methods=["POST"])
def api_group_add_member(group_id):
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    actor = _membership(current_user.id, group_id)
    if actor is None:
        return json_error("Not a member of this group", 403)
    if actor.user_role not in (GroupRole.OWNER, GroupRole.ADMIN):
        return json_error("Only owners and admins can add members", 403)

    payload, error = require_json_payload()
    if error:
        return error
    email = payload.get("email")
    if not email or not str(email).strip():
        return json_error("email is required", 400)
    email = str(email).strip().lower()
    new_user = User.query.filter_by(email=email).first()
    if new_user is None:
        return json_error("No user with that email", 404)
    if _membership(new_user.id, group_id) is not None:
        return json_error("User is already in this group", 409)

    new_m = UserGroupMembership(
        user_id=new_user.id,
        group_id=group_id,
        user_role=GroupRole.MEMBER,
    )
    db.session.add(new_m)
    db.session.commit()
    return jsonify(group=_group_detail_payload(group_id, actor)), 201


@private_api.route("/groups/<int:group_id>/members/<int:user_id>", methods=["DELETE"])
def api_group_remove_member(group_id, user_id):
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    actor = _membership(current_user.id, group_id)
    target = _membership(user_id, group_id)
    if actor is None:
        return json_error("Not a member of this group", 403)
    if target is None:
        return json_error("Target is not a member of this group", 404)

    is_self = user_id == current_user.id
    if not is_self:
        if actor.user_role == GroupRole.MEMBER:
            return json_error("Only owners and admins can remove other members", 403)
        if actor.user_role == GroupRole.ADMIN:
            if target.user_role in (GroupRole.OWNER, GroupRole.ADMIN):
                return json_error("Admins cannot remove owners or other admins", 403)
    if is_self and target.user_role == GroupRole.OWNER:
        others = (
            UserGroupMembership.query.filter(
                UserGroupMembership.group_id == group_id,
                UserGroupMembership.user_id != current_user.id,
            ).count()
        )
        if others > 0:
            _promote_next_owner(group_id, current_user.id)

    db.session.delete(target)
    db.session.commit()
    _maybe_prune_empty_group(group_id)
    return jsonify(success=True)


def _parse_month(raw, fallback):
    # Parse "YYYY-MM" → first-of-month datetime. Returns fallback on bad input.
    if not raw:
        return fallback
    try:
        year, month = raw.split("-", 1)
        return datetime(int(year), int(month), 1)
    except (TypeError, ValueError):
        return fallback


def _next_month_start(dt):
    return datetime(dt.year + 1, 1, 1) if dt.month == 12 else datetime(dt.year, dt.month + 1, 1)


@private_api.route("/dashboard/summary", methods=["GET"])
def api_dashboard_summary():
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)

    now = datetime.now(UTC).replace(tzinfo=None)
    month_start = datetime(now.year, now.month, 1)

    # Personal dashboard excludes group-tagged transactions (Issue 6).
    personal_only = (
        Transaction.user_id == current_user.id,
        Transaction.group_id.is_(None),
    )

    total_balance = float(
        db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(*personal_only)
        .scalar() or 0
    )

    monthly_income = float(
        db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            *personal_only,
            Transaction.created_at >= month_start,
            Transaction.amount > 0,
        )
        .scalar() or 0
    )

    monthly_expenses_raw = float(
        db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            *personal_only,
            Transaction.created_at >= month_start,
            Transaction.amount < 0,
        )
        .scalar() or 0
    )
    monthly_expenses = abs(monthly_expenses_raw)

    # Monthly savings = sum of explicit savings-type transactions (Issue 5).
    monthly_savings = float(
        db.session.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            *personal_only,
            Transaction.created_at >= month_start,
            Transaction.transaction_type == "savings",
        )
        .scalar() or 0
    )

    # Breakdown is scoped to a user-selectable month (?month=YYYY-MM); the
    # other monthly_* stats stay on the current calendar month so the stat
    # cards keep their "this month" meaning.
    breakdown_month_start = _parse_month(request.args.get("month"), month_start)
    breakdown_month_end = _next_month_start(breakdown_month_start)

    # Expense Breakdown chart — expenses only, broken down by category (Issue 1).
    breakdown_rows = (
        db.session.query(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(
            *personal_only,
            Transaction.created_at >= breakdown_month_start,
            Transaction.created_at < breakdown_month_end,
            Transaction.transaction_type == "expense",
        )
        .group_by(Transaction.category)
        .all()
    )
    expense_breakdown = [
        {"category": category or "other", "amount": abs(float(total or 0))}
        for category, total in breakdown_rows
    ]
    breakdown_total = sum(item["amount"] for item in expense_breakdown)

    # Month dropdown options — every month with personal expenses, newest
    # first, plus the current month so it is always selectable.
    month_rows = (
        db.session.query(
            func.strftime("%Y-%m", Transaction.created_at).label("ym")
        )
        .filter(
            *personal_only,
            Transaction.transaction_type == "expense",
        )
        .group_by("ym")
        .order_by(db.desc("ym"))
        .all()
    )
    month_values = {row.ym for row in month_rows if row.ym}
    month_values.add(month_start.strftime("%Y-%m"))
    month_values.add(breakdown_month_start.strftime("%Y-%m"))
    available_months = [
        {"value": ym, "label": datetime.strptime(ym, "%Y-%m").strftime("%B %Y")}
        for ym in sorted(month_values, reverse=True)
    ]

    rows = (
        db.session.query(Transaction, Group.group_name)
        .outerjoin(Group, Transaction.group_id == Group.id)
        .filter(*personal_only)
        .order_by(Transaction.created_at.desc())
        .limit(7)
        .all()
    )
    recent_transactions = [_transaction_to_json(tx, gname) for tx, gname in rows]

    return jsonify(
        total_balance=total_balance,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_savings=monthly_savings,
        current_month=datetime.now(UTC).strftime("%B %Y"),
        expense_breakdown=expense_breakdown,
        breakdown_month=breakdown_month_start.strftime("%Y-%m"),
        breakdown_month_label=breakdown_month_start.strftime("%B %Y"),
        breakdown_total=breakdown_total,
        available_months=available_months,
        recent_transactions=recent_transactions,
    )
