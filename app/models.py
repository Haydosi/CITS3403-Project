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


# User table
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
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return self.role == "admin"


@login.user_loader
def load_user(id):
    return db.session.get(User, int(id))

# group table
class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    group_name = db.Column(db.String(50), nullable=False, unique=False)


# user group linking table
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
