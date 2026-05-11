from flask import render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from urllib.parse import urlparse
from app import db
from app.blueprints import main
from app.models import User
from app.forms import LoginForm, RegisterForm


# renders templates
@main.route("/")
@login_required
def dashboard():
    return render_template("dashboard.html")

@main.route("/leaderboard")
@login_required
def leaderboard():
    return render_template("leaderboard.html")

@main.route("/debt-calculator")
def debt_calculator():
    return render_template("debt_calculator.html")

# ======== Authentication ========
@main.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user is None or not user.check_password(form.password.data):
            flash("Invalid email or password")
            return redirect(url_for("main.login"))
        login_user(user)
        next_page = request.args.get("next")
        if not next_page or urlparse(next_page).netloc != "":
            next_page = url_for("main.dashboard")
        return redirect(next_page)
    return render_template("login.html", form=form)


@main.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    form = RegisterForm()
    if form.validate_on_submit():
        if User.query.filter_by(email=form.email.data).first():
            flash("An account with that email already exists")
            return redirect(url_for("main.register"))
        user = User(email=form.email.data, username=form.email.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        return redirect(url_for("main.login"))
    return render_template("register.html", form=form)


@main.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("main.login"))
