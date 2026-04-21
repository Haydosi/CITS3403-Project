from flask import Flask, render_template

app = Flask(__name__)

# renders templates
@app.route("/")
def dashboard():
    return render_template("dashboard.html")


# makes file run as program for starting via running directly
if __name__ == "__main__":
    app.run(debug=True)