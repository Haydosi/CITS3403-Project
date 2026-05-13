from flask import Flask
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

import config
from config import Config


db = SQLAlchemy()
migrate = Migrate()
login = LoginManager()
login.login_view = "main.login"

def create_app(config= config.DeploymentConfig):
    flask_app = Flask(__name__)
    flask_app.config.from_object(config)
    db.init_app(flask_app)
    migrate.init_app(flask_app, db)
    login.init_app(flask_app)
    
    # init routes
    from app.blueprints import main
    from app.api import public_api, private_api

    flask_app.register_blueprint(main)
    flask_app.register_blueprint(public_api)
    flask_app.register_blueprint(private_api)

    return flask_app
