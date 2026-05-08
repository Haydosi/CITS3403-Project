from flask import Flask
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

from config import Config


db = SQLAlchemy()
migrate = Migrate()

def create_app(config):
    flask_app = Flask(__name__)
    flask_app.config.from_object(config)
    db.init_app(flask_app)
    migrate.init_app(flask_app, db)
    
    #init routes
    
    from app.blueprints import main
    flask_app.register_blueprint(main)
    
    return flask_app







# add login stuff later, then uncomment below
# login = LoginManager(app)
# login.login_view = "login"

from app import models
