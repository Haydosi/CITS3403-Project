import math

from flask import Blueprint, request, jsonify
from flask_login import current_user, login_user, logout_user
from sqlalchemy import func
from app import db
from app.models import User, Transaction, FamilyMember, FamilyTransaction, UserGroupMembership, SavingsTarget

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


@private_api.route("/leaderboard", methods=["GET"])
def api_leaderboard():
    # Private leaderboard endpoint - returns top savers globally.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    
    # Query to calculate total savings per user
    leaderboard_query = db.session.query(
        User.id,
        User.username,
        User.email,
        User.first_name,
        User.last_name,
        func.coalesce(func.sum(Transaction.amount), 0).label('total_saved')
    ).outerjoin(Transaction, User.id == Transaction.user_id).group_by(User.id).order_by(
        func.coalesce(func.sum(Transaction.amount), 0).desc()
    ).limit(10)
    
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
    
    return jsonify(leaderboard=leaderboard)


@private_api.route("/leaderboard/family/<int:group_id>", methods=["GET"])
def api_family_leaderboard(group_id):
    # Private family leaderboard endpoint - returns top savers in a specific family group.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    
    # Query to calculate total savings per user in a specific group
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
    ).outerjoin(
        Transaction,
        (User.id == Transaction.user_id) & (Transaction.group_id == group_id)
    ).group_by(
        User.id,
        User.username,
        User.email,
        User.first_name,
        User.last_name
    ).order_by(
        func.coalesce(func.sum(Transaction.amount), 0).desc()
    )
    
    leaderboard = []
    for member_id, global_user_id, first_name, last_name, email, total_saved in leaderboard_query:
        leaderboard.append({
            "id": member_id,
            "global_user_id": global_user_id,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "total_saved": float(total_saved) if total_saved else 0,
        })

    return jsonify(leaderboard=leaderboard)


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
