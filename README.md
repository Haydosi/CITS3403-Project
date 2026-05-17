# MyMoney — CITS3403 Group Project

**MyMoney** is a personal finance web application that helps users track income and expenses, set savings targets, and compare their financial progress with friends.

## Purpose

Managing personal finances is difficult without visibility. MyMoney gives users a single place to log every transaction, see where their money goes, and stay motivated through social accountability. The core idea is that budgeting feels less like a chore when you can see your own momentum and optionally share progress with a group.

## Features

- Dashboard — live summary of total balance, monthly income, expenses breakdown, and savings
- Transactions — full ledger of income and expense entries with category tagging, filtering, and search.
- Savings Targets — create named goals (e.g. "Summer Trip", "Emergency Fund") with a target amount and deadline; contribute amounts and track progress to completion.
- Groups — share financial summaries with trusted friends or family so you can hold each other accountable.
- Leaderboard —  ranking of group members by savings rate or target completion, adding a light competitive element to encourage consistent saving.
- Debt Calculator — full client-side tool covering personal loans, credit cards, and mortgages (repayments, borrowing capacity, and pay-off timeline modes).

## Design

The UI uses Bootstrap 5 in dark mode with a fixed sidebar layout. Every page extends a shared base template that wires up fonts, icons, and the sidebar. Charts are rendered with Chart.js. All user-supplied content is inserted via `textContent` / `createElement` (never `innerHTML` string interpolation) to prevent XSS.

The backend is Flask + SQLAlchemy with Flask-Migrate managing schema changes. Authentication is handled by Flask-Login. The frontend communicates with the server through a REST-style JSON API; each model exposes a `to_dict()` method for serialisation.

## Team

| UWA id   | Name         | Github ID     |
| -------- | ------------ | ------------- |
| 24729742 | Scout Wu     | Exusiai101    |
| 24214482 | Hayden Ivins | Haydosi       |
| 24256619 | Danny Nguyen | ThanhBinh5104 |



<br>
<br>

<h5>For the python virtual environment</h5>

Tested for python 3.12

Use python venv:
```bash
python3 -m venv .venv
```

On MacOS:
```bash
source .venv/bin/activate
```

Install anything that's needed from requirements.txt
```bash
pip3 install -r python_requirements.txt
```

<br>
<h5>How to run</h5>

Run/test with:
```bash
flask --app mymoney run --debug
```

<br>
<h5>Database</h5>

After changing `models.py` run:
```bash
flask --app mymoney db migrate -m "message goes here"
```
in order to create the migrations

Then run:
```bash
flask --app mymoney db upgrade
```
to update the database

You also need to run this when pulling changed migrations
and by extension run it the first time you pull/clone the
project 
(since the database is in .gitignore)


<br>
<h5>Testing</h5>

For running unit tests:
```bash
python -m unittest
```

For running Selenium UI tests (requires Google Chrome and ChromeDriver installed):
```bash
python -m unittest tests.test_ui
```

When running tests under windows, might encounter
```bash
os.unlink(_db_path)
PermissionError: [WinError 32]
```
It's caused by windows, the test actually succeeded.