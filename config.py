import os

basedir = os.path.abspath(os.path.dirname(__file__))

#config class here
class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-secret-key"

    SQLALCHEMY_DATABASE_URI = (

        os.environ.get("DATABASE_URL")

        or "sqlite:///" + os.path.join(basedir, "app.db")

    )
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
