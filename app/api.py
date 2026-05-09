import math

from flask import Blueprint, request, jsonify
from flask_login import current_user, login_user, logout_user
from app import db
from app.models import User

# API blueprint for JSON endpoints.
# All routes in this file are mounted under /api.
api = Blueprint("api", __name__, url_prefix="/api")


def json_error(message, status=400):
    # Standardize JSON error responses with a message and status code.
    return jsonify(error=message), status


def require_json_payload():
    # Parse JSON payload from the request body.
    payload = request.get_json(silent=True)
    if payload is None:
        return None, json_error("Request must be JSON", 400)
    return payload, None


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


@api.route("/auth/login", methods=["POST"])
def api_login():
    # Login endpoint for API clients.
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


@api.route("/auth/register", methods=["POST"])
def api_register():
    # Register a new user account over JSON.
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


@api.route("/auth/logout", methods=["POST", "GET"])
def api_logout():
    # Logout endpoint; works for both POST and GET.
    if current_user.is_authenticated:
        logout_user()
    return jsonify(success=True)


@api.route("/auth/user", methods=["GET"])
def api_current_user():
    # Return the current authenticated user.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    return jsonify(user=current_user.to_dict())


@api.route("/users", methods=["GET"])
def api_users():
    # List all users. Protected endpoint.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    users = User.query.order_by(User.id.asc()).all()
    return jsonify(users=[user.to_dict() for user in users])


@api.route("/users/<int:user_id>", methods=["GET"])
def api_user_detail(user_id):
    # Return a single user by id.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    user = User.query.get(user_id)
    if user is None:
        return json_error("User not found", 404)
    return jsonify(user=user.to_dict())


@api.route("/dashboard", methods=["GET"])
def api_dashboard():
    # Dashboard summary data for authenticated users.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    latest_users = [u.to_dict() for u in User.query.order_by(User.created_at.desc()).limit(5).all()]
    return jsonify(total_users=total_users, active_users=active_users, latest_users=latest_users)


@api.route("/leaderboard", methods=["GET"])
def api_leaderboard():
    # Leaderboard endpoint; currently returns recent user accounts.
    if not current_user.is_authenticated:
        return json_error("Authentication required", 401)
    users = User.query.order_by(User.created_at.desc()).limit(10).all()
    return jsonify(leaderboard=[u.to_dict() for u in users])


@api.route("/debt/loan/repayments", methods=["POST"])
def api_debt_loan_repayments():
    # Loan repayment calculator endpoint.
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


@api.route("/debt/loan/borrow", methods=["POST"])
def api_debt_loan_borrow():
    # Borrowing capacity endpoint.
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


@api.route("/debt/loan/sooner", methods=["POST"])
def api_debt_loan_sooner():
    # Loan payoff estimator endpoint.
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
