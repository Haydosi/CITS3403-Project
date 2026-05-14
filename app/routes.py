from datetime import datetime, UTC

from flask import render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from urllib.parse import urlparse
from app import db
from app.blueprints import main
from app.models import User
from app.forms import LoginForm, RegisterForm, EditProfileForm, ChangePasswordForm


# renders templates

@main.route("/")
@login_required
def dashboard():
    now = datetime.now(UTC)
    return render_template(
        "dashboard.html",
        current_month=now.strftime("%B %Y"),
        current_month_short=now.strftime("%B"),
    )

@main.route("/leaderboard")
@login_required
def leaderboard():
    return render_template("leaderboard.html")


@main.route("/transactions")
@login_required
def transactions():
    return render_template("transactions.html")


@main.route("/groups")
@login_required
def groups():
    return render_template("groups.html")


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
            flash("An account with that email already exists.")
            return redirect(url_for("main.register"))
        if User.query.filter_by(username=form.username.data).first():
            flash("That username is already taken.")
            return redirect(url_for("main.register"))
        user = User(
            username=form.username.data.strip(),
            email=form.email.data.strip(),
            first_name=(form.first_name.data or '').strip() or None,
            last_name=(form.last_name.data or '').strip() or None,
        )
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        return redirect(url_for("main.login"))
    return render_template("register.html", form=form)


@main.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    edit_form = EditProfileForm(obj=current_user)
    password_form = ChangePasswordForm()

    if request.method == "POST":
        action = request.form.get("action")

        if action == "edit_profile" and edit_form.validate_on_submit():
            new_username = edit_form.username.data.strip()
            new_email = edit_form.email.data.strip()

            conflict = User.query.filter(
                User.username == new_username, User.id != current_user.id
            ).first()
            if conflict:
                flash("That username is already taken.", "danger")
                return render_template("profile.html", edit_form=edit_form, password_form=password_form, active_tab="edit")

            conflict = User.query.filter(
                User.email == new_email, User.id != current_user.id
            ).first()
            if conflict:
                flash("An account with that email already exists.", "danger")
                return render_template("profile.html", edit_form=edit_form, password_form=password_form, active_tab="edit")

            current_user.username = new_username
            current_user.email = new_email
            current_user.first_name = (edit_form.first_name.data or '').strip() or None
            current_user.last_name = (edit_form.last_name.data or '').strip() or None
            db.session.commit()
            flash("Profile updated successfully.", "success")
            return redirect(url_for("main.profile"))

        if action == "change_password" and password_form.validate_on_submit():
            if not current_user.check_password(password_form.current_password.data):
                flash("Current password is incorrect.", "danger")
                return render_template("profile.html", edit_form=edit_form, password_form=password_form, active_tab="password")
            current_user.set_password(password_form.new_password.data)
            db.session.commit()
            flash("Password changed successfully.", "success")
            return redirect(url_for("main.profile"))

        # Form had validation errors — keep relevant tab open
        active_tab = "edit" if action == "edit_profile" else "password"
        return render_template("profile.html", edit_form=edit_form, password_form=password_form, active_tab=active_tab)

    return render_template("profile.html", edit_form=edit_form, password_form=password_form, active_tab="view")


@main.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("main.login"))
