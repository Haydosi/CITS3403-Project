from unittest import TestCase
from app import create_app, db
from app.models import Group, GroupRole, User, UserGroupMembership
from config import TestingConfig


def add_test_data_db():
    hayden = User(
        username="hayden",
        email="hayden@example.com",
        first_name="Hayden",
        last_name="Ivins",
    )
    hayden.set_password("password123")

    scout = User(
        username="scout",
        email="scout@example.com",
        first_name="Scout",
        last_name="Wu",
    )
    scout.set_password("password123")

    danny = User(
        username="danny",
        email="danny@example.com",
        first_name="Danny",
        last_name="Nguyen",
    )
    danny.set_password("password123")

    family_group = Group(group_name="Family")
    study_group = Group(group_name="Study Group")

    db.session.add_all([hayden, scout, danny, family_group, study_group])
    db.session.commit()

    hayden_family = UserGroupMembership(
        user_id=hayden.id,
        group_id=family_group.id,
        user_role=GroupRole.OWNER,
    )
    scout_family = UserGroupMembership(
        user_id=scout.id,
        group_id=family_group.id,
        user_role=GroupRole.MEMBER,
    )
    danny_family = UserGroupMembership(
        user_id=danny.id,
        group_id=family_group.id,
        user_role=GroupRole.MEMBER,
    )
    hayden_study = UserGroupMembership(
        user_id=hayden.id,
        group_id=study_group.id,
        user_role=GroupRole.ADMIN,
    )

    db.session.add_all([hayden_family, scout_family,
                       danny_family, hayden_study])
    db.session.commit()


class BasicTests(TestCase):

    def setUp(self):
        testApp = create_app(TestingConfig)
        self.app_context = testApp.app_context()
        self.app_context.push()
        db.create_all()
        add_test_data_db()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_link_table_creates_expected_memberships(self):
        memberships = UserGroupMembership.query.all()

        self.assertEqual(len(memberships), 4)

        hayden = User.query.filter_by(username="hayden").first()
        scout = User.query.filter_by(username="scout").first()
        family_group = Group.query.filter_by(group_name="Family").first()

        hayden_family = UserGroupMembership.query.filter_by(
            user_id=hayden.id,
            group_id=family_group.id,
        ).first()
        scout_family = UserGroupMembership.query.filter_by(
            user_id=scout.id,
            group_id=family_group.id,
        ).first()

        self.assertIsNotNone(hayden_family)
        self.assertIsNotNone(scout_family)
        self.assertEqual(hayden_family.user_role, GroupRole.OWNER)
        self.assertEqual(scout_family.user_role, GroupRole.MEMBER)

    def test_user_can_belong_to_multiple_groups(self):
        hayden = User.query.filter_by(username="hayden").first()
        hayden_memberships = UserGroupMembership.query.filter_by(
            user_id=hayden.id,
        ).all()

        group_ids = {membership.group_id for membership in hayden_memberships}
        group_names = {
            db.session.get(Group, group_id).group_name
            for group_id in group_ids
        }

        self.assertEqual(len(hayden_memberships), 2)
        self.assertEqual(group_names, {"Family", "Study Group"})
