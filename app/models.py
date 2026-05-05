from app import db


#simple test model, replace with something else later
class TestModel(db.Model):

    id = db.Column(db.Integer, primary_key=True)