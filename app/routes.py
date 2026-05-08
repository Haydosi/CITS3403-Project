from flask import render_template
from app.blueprints import main


# renders templates
@main.route("/")
def dashboard():
    return render_template("dashboard.html")

@main.route("/leaderboard")
def leaderboard():
    return render_template("leaderboard.html")

@main.route("/login")
def login():
    return render_template("login.html")

@main.route("/debt-calculator")
def debt_calculator():
    return render_template("debt_calculator.html")
