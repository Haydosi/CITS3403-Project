from app import db, login
from sqlalchemy import CheckConstraint
from datetime import datetime, UTC
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from enum import Enum


# since datetime.utcnow is deprecated
# uses this instead
# because of timezone awarenes or something
def utc_now():
    return datetime.now(UTC)


class GroupRole(Enum):
    MEMBER = "member"
    ADMIN = "admin"
    OWNER = "owner"


# User table stores application users and authentication information.
# This model is also used by Flask-Login via UserMixin.
class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    role = db.Column(db.String(30), nullable=False, default='user')
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now,
                           onupdate=utc_now)

    def set_password(self, password):
        # Hash a raw password before storing it.
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        # Verify a raw password against the stored hash.
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        # Convert user fields into a JSON-friendly dictionary.
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


@login.user_loader
def load_user(id):
    # Flask-Login callback used to restore a user from the session.
    return db.session.get(User, int(id))

# Group table holds optional group metadata.
# It can be used to organize users into named groups.
class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    group_name = db.Column(db.String(50), nullable=False, unique=False)

    def to_dict(self):
        # JSON-friendly serialization for group records.
        return {
            "id": self.id,
            "group_name": self.group_name,
        }


# user group linking table
# Associates a user with a group and stores the member's role.
class UserGroupMembership(db.Model):
    __tablename__ = "user_group_memberships"

    __table_args__ = (
        db.UniqueConstraint("user_id", "group_id",
                            name="unique_user_group_membership"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
    )

    group_id = db.Column(
        db.Integer,
        db.ForeignKey("groups.id"),
        nullable=False,
    )

    user_role = db.Column(db.Enum(GroupRole), nullable=False,
                          default=GroupRole.MEMBER, unique=False)

    def to_dict(self):
        # Serialize membership records for API responses.
        return {
            "id": self.id,
            "user_id": self.user_id,
            "group_id": self.group_id,
            "user_role": self.user_role.value if self.user_role else None,
        }
