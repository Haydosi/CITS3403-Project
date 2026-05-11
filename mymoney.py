from app import create_app, db
from config import DeploymentConfig



flask_app = create_app(DeploymentConfig())

