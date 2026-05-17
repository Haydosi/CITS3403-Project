# CITS3403-Project

Repo for Project

| UWA id   | Name         | Github ID     |
| -------- | --------     | ----------    |
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