from flask import render_template
from app import app


# renders templates
@app.route("/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/leaderboard")
def leaderboard():
    return render_template("leaderboard.html")

@app.route("/login")
def login():
    return render_template("login.html")

@app.route("/debt-calculator")
def debt_calculator():
    return render_template("debt_calculator.html")
