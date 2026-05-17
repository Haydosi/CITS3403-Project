from app import db, login
from datetime import datetime, UTC
from enum import Enum
from sqlalchemy import CheckConstraint
from flask_login import UserMixin
from sqlalchemy.orm import foreign, relationship
from werkzeug.security import generate_password_hash, check_password_hash


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

    group_memberships = relationship(
        "UserGroupMembership",
        back_populates="user",
        foreign_keys="UserGroupMembership.user_id",
    )
    transactions = relationship(
        "Transaction",
        back_populates="user",
        foreign_keys="Transaction.user_id",
    )
    family_member_snapshots = relationship(
        "FamilyMember",
        back_populates="user",
        primaryjoin="User.id == foreign(FamilyMember.global_user_id)",
        foreign_keys="FamilyMember.global_user_id",
    )

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
    leaderboard_enabled = db.Column(
        db.Boolean,
        nullable=False,
        default=True,
        server_default=db.text("1"),
    )

    memberships = relationship(
        "UserGroupMembership",
        back_populates="group",
    )
    transactions = relationship(
        "Transaction",
        back_populates="group",
        foreign_keys="Transaction.group_id",
    )
    family_profile = relationship(
        "FamilyGroup",
        back_populates="global_group",
        uselist=False,
    )

    def to_dict(self):
        # JSON-friendly serialization for group records.
        return {
            "id": self.id,
            "group_name": self.group_name,
            "leaderboard_enabled": bool(self.leaderboard_enabled),
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

    user = relationship(
        "User",
        back_populates="group_memberships",
        foreign_keys=[user_id],
    )
    group = relationship(
        "Group",
        back_populates="memberships",
        foreign_keys=[group_id],
    )

    def to_dict(self):
        # Serialize membership records for API responses.
        return {
            "id": self.id,
            "user_id": self.user_id,
            "group_id": self.group_id,
            "user_role": self.user_role.value if self.user_role else None,
        }


# Transaction table tracks user savings and financial activities.
class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
    )
    group_id = db.Column(
        db.Integer,
        db.ForeignKey("groups.id"),
        nullable=True,  # Optional: can be part of a group
    )
    amount = db.Column(db.Numeric(precision=12, scale=2), nullable=False)  # Amount saved (positive) or spent (negative)
    description = db.Column(db.String(255))
    transaction_type = db.Column(db.String(50), nullable=False, default="savings")  # savings, expense, transfer
    category = db.Column(db.String(50), nullable=True)  # Sub-category for expense rows (e.g. food, transport)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now,
                           onupdate=utc_now)

    user = relationship(
        "User",
        back_populates="transactions",
        foreign_keys=[user_id],
    )
    group = relationship(
        "Group",
        back_populates="transactions",
        foreign_keys=[group_id],
    )

    def to_dict(self):
        # Convert transaction to JSON-friendly dictionary.
        return {
            "id": self.id,
            "user_id": self.user_id,
            "group_id": self.group_id,
            "amount": self.amount,
            "description": self.description,
            "transaction_type": self.transaction_type,
            "category": self.category,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# Family-specific database models for group-focused leaderboards and goals

# Family Group table - stores family-specific data and aggregations
class FamilyGroup(db.Model):
    __tablename__ = "family_groups"

    id = db.Column(db.Integer, primary_key=True)
    global_group_id = db.Column(
        db.Integer,
        db.ForeignKey("groups.id"),
        nullable=False,
        unique=True
    )
    group_name = db.Column(db.String(50), nullable=False)
    owner_id = db.Column(db.Integer, nullable=False)
    family_code = db.Column(db.String(20), unique=True)
    total_savings = db.Column(db.Float, default=0)
    member_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now,
                           onupdate=utc_now)

    global_group = relationship(
        "Group",
        back_populates="family_profile",
        foreign_keys=[global_group_id],
    )
    owner = relationship(
        "User",
        primaryjoin="FamilyGroup.owner_id == foreign(User.id)",
        foreign_keys="FamilyGroup.owner_id",
    )
    family_members = relationship(
        "FamilyMember",
        back_populates="family_group",
    )
    family_goals = relationship(
        "FamilyGoal",
        back_populates="family_group",
    )
    family_transactions = relationship(
        "FamilyTransaction",
        back_populates="family_group",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "global_group_id": self.global_group_id,
            "group_name": self.group_name,
            "owner_id": self.owner_id,
            "family_code": self.family_code,
            "total_savings": self.total_savings,
            "member_count": self.member_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# Family Member table - maintains member records with contribution percentages
class FamilyMember(db.Model):
    __tablename__ = "family_members"

    __table_args__ = (
        db.UniqueConstraint("family_group_id", "global_user_id",
                            name="unique_family_member"),
    )

    id = db.Column(db.Integer, primary_key=True)
    family_group_id = db.Column(
        db.Integer,
        db.ForeignKey("family_groups.id"),
        nullable=False
    )
    global_user_id = db.Column(db.Integer, nullable=False)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    email = db.Column(db.String(255))
    total_savings = db.Column(db.Float, default=0)
    contribution_percentage = db.Column(db.Float, default=0)
    member_since = db.Column(db.DateTime, nullable=False, default=utc_now)
    last_updated = db.Column(db.DateTime, nullable=False, default=utc_now,
                             onupdate=utc_now)

    family_group = relationship(
        "FamilyGroup",
        back_populates="family_members",
        foreign_keys=[family_group_id],
    )
    user = relationship(
        "User",
        back_populates="family_member_snapshots",
        primaryjoin="foreign(FamilyMember.global_user_id) == User.id",
        foreign_keys="FamilyMember.global_user_id",
    )
    cached_transactions = relationship(
        "FamilyTransaction",
        back_populates="family_member",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "family_group_id": self.family_group_id,
            "global_user_id": self.global_user_id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "total_savings": self.total_savings,
            "contribution_percentage": self.contribution_percentage,
            "member_since": self.member_since.isoformat() if self.member_since else None,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }


# Family Transaction table - cached transactions for performance
class FamilyTransaction(db.Model):
    __tablename__ = "family_transactions"

    id = db.Column(db.Integer, primary_key=True)
    family_group_id = db.Column(
        db.Integer,
        db.ForeignKey("family_groups.id"),
        nullable=False
    )
    family_member_id = db.Column(
        db.Integer,
        db.ForeignKey("family_members.id"),
        nullable=False
    )
    amount = db.Column(db.Numeric(precision=12, scale=2), nullable=False)
    description = db.Column(db.String(255))
    transaction_type = db.Column(db.String(50), nullable=False, default="savings")
    recorded_at = db.Column(db.DateTime, nullable=False, default=utc_now)

    family_group = relationship(
        "FamilyGroup",
        back_populates="family_transactions",
        foreign_keys=[family_group_id],
    )
    family_member = relationship(
        "FamilyMember",
        back_populates="cached_transactions",
        foreign_keys=[family_member_id],
    )

    def to_dict(self):
        return {
            "id": self.id,
            "family_group_id": self.family_group_id,
            "family_member_id": self.family_member_id,
            "amount": self.amount,
            "description": self.description,
            "transaction_type": self.transaction_type,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }


# Family Goal table - shared savings goals for families
class FamilyGoal(db.Model):
    __tablename__ = "family_goals"

    id = db.Column(db.Integer, primary_key=True)
    family_group_id = db.Column(
        db.Integer,
        db.ForeignKey("family_groups.id"),
        nullable=False
    )
    goal_name = db.Column(db.String(100), nullable=False)
    target_amount = db.Column(db.Numeric(precision=12, scale=2), nullable=False)
    current_amount = db.Column(db.Numeric(precision=12, scale=2), default=0)
    deadline = db.Column(db.Date)
    status = db.Column(db.String(20), default="active")  # active, completed, cancelled
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now,
                           onupdate=utc_now)

    family_group = relationship(
        "FamilyGroup",
        back_populates="family_goals",
        foreign_keys=[family_group_id],
    )

    def to_dict(self):
        return {
            "id": self.id,
            "family_group_id": self.family_group_id,
            "goal_name": self.goal_name,
            "target_amount": self.target_amount,
            "current_amount": self.current_amount,
            "deadline": self.deadline.isoformat() if self.deadline else None,
            "status": self.status,
            "progress_percentage": (self.current_amount / self.target_amount * 100) if self.target_amount > 0 else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# Thresholds for the computed savings-target status (see SavingsTarget.status).
# Compared against (time_elapsed_ratio - progress_ratio).
TARGET_ON_TRACK_GAP = 0.10
TARGET_AT_RISK_GAP = 0.25


# SavingsTarget table - per-user savings goals shown on the dashboard.
class SavingsTarget(db.Model):
    __tablename__ = "savings_targets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
    )
    name = db.Column(db.String(100), nullable=False)
    emoji = db.Column(db.String(16), nullable=False, default="🎯")
    target_amount = db.Column(db.Numeric(precision=12, scale=2), nullable=False)
    current_amount = db.Column(db.Numeric(precision=12, scale=2),
                               nullable=False, default=0)
    deadline = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now,
                           onupdate=utc_now)

    @property
    def progress_percentage(self):
        # Progress toward the goal as a 0-100 number, capped at 100.
        target = float(self.target_amount or 0)
        if target <= 0:
            return 0.0
        pct = float(self.current_amount or 0) / target * 100
        return round(min(pct, 100.0), 2)

    @property
    def status(self):
        # Computed "Success Forecast": compares progress against time elapsed.
        target = float(self.target_amount or 0)
        current = float(self.current_amount or 0)
        progress_ratio = (current / target) if target > 0 else 0.0
        if progress_ratio >= 1:
            return "completed"

        created = self.created_at
        if created.tzinfo is not None:
            created = created.replace(tzinfo=None)
        deadline_dt = datetime.combine(self.deadline, datetime.min.time())
        now = datetime.now(UTC).replace(tzinfo=None)

        total_duration = (deadline_dt - created).total_seconds()
        # Past the deadline (deadline counts as midnight of that day) and not yet complete.
        if total_duration <= 0 or now >= deadline_dt:
            return "behind"

        elapsed = (now - created).total_seconds()
        time_ratio = max(0.0, min(elapsed / total_duration, 1.0))
        gap = time_ratio - progress_ratio
        if gap <= TARGET_ON_TRACK_GAP:
            return "on-track"
        if gap <= TARGET_AT_RISK_GAP:
            return "at-risk"
        return "behind"

    def to_dict(self):
        # JSON-friendly serialization for API responses.
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "emoji": self.emoji,
            "target_amount": float(self.target_amount) if self.target_amount is not None else 0,
            "current_amount": float(self.current_amount) if self.current_amount is not None else 0,
            "deadline": self.deadline.isoformat() if self.deadline else None,
            "status": self.status,
            "progress_percentage": self.progress_percentage,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
