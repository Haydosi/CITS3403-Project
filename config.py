import os

basedir = os.path.abspath(os.path.dirname(__file__))

#config class here
class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-secret-key"

    
    

class DeploymentConfig(Config): 
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("DATABASE_URL")
        or "sqlite:///" + os.path.join(basedir, "app.db")
    )

class TestingConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory"
    TESTING=True