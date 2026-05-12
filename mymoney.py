from app import create_app, db
from config import DeploymentConfig


flask_app = create_app(DeploymentConfig())


@flask_app.cli.command("seed")
def seed_command():
    """Populate the database with mock users, transactions, and groups (skips if data exists)."""
    from app.seed import seed_if_empty
    with flask_app.app_context():
        seed_if_empty()


# Auto-seed on debug startup (only in the Werkzeug child process, not the reloader parent)
from app.seed import auto_seed_if_debug
auto_seed_if_debug(flask_app)

