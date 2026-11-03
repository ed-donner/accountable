import pytest
from accountable import db, users
from accountable.crm.sample_data import TEAMMATES
from sqlalchemy import select

ROBIN = "robin@accountable.example"


@pytest.mark.parametrize(
    ("name", "email", "expected"),
    [
        ("Alex Rivera", "alex@accountable.example", "AR"),
        ("Cher", "cher@accountable.example", "C"),
        ("Mary Anne Whitfield", "mary@accountable.example", "MW"),
        ("dana whitfield", "dana@accountable.example", "DW"),
        ("  Theo   Brandt  ", "theo@accountable.example", "TB"),
        ("Ελένη Παπαδοπούλου", "eleni@accountable.example", "ΕΠ"),
        ("Émile Zola", "emile@accountable.example", "ÉZ"),
        (None, ROBIN, "R"),
        ("", ROBIN, "R"),
        ("   ", ROBIN, "R"),
    ],
)
def test_initials(name, email, expected):
    assert users.initials(name, email) == expected


def test_the_name_is_the_display_name():
    assert users.name_of("Alex Rivera", "alex@accountable.example") == "Alex Rivera"


@pytest.mark.parametrize("name", [None, "", "  "])
def test_with_no_display_name_the_name_is_the_email(name):
    assert users.name_of(name, ROBIN) == ROBIN


def test_a_profile_has_the_name_email_and_initials():
    assert users.profile("u-1", None, ROBIN).model_dump() == {
        "id": "u-1",
        "name": ROBIN,
        "email": ROBIN,
        "initials": "R",
    }


def test_a_person_in_a_reply_falls_back_to_the_email():
    assert users.person("u-1", "Alex Rivera", "alex@accountable.example") == users.Person(id="u-1", name="Alex Rivera")
    assert users.person("u-2", None, ROBIN) == users.Person(id="u-2", name=ROBIN)


def test_nobody_recorded_is_no_person():
    assert users.person(None, None, None) is None


def everyone() -> list[tuple]:
    with db.reading() as conn:
        return [tuple(row) for row in conn.execute(select(users.users.c.id, users.users.c.name, users.users.c.email))]


def remember(id: str, name: str | None, email: str) -> bool:
    with db.writing() as conn:
        return users.remember(conn, id, name, email)


def test_remember_adds_a_new_person(database):
    assert remember("u-1", "Alex Rivera", "alex@accountable.example") is True
    assert everyone() == [("u-1", "Alex Rivera", "alex@accountable.example")]


def test_remember_keeps_no_display_name_as_blank(database):
    remember("u-1", "  ", ROBIN)
    assert everyone() == [("u-1", None, ROBIN)]


def test_remember_writes_nothing_when_nothing_changed(database):
    remember("u-1", "Alex Rivera", "alex@accountable.example")
    with db.reading() as conn:
        before = conn.execute(select(users.users)).one()

    assert remember("u-1", "Alex Rivera", "alex@accountable.example") is False

    with db.reading() as conn:
        assert conn.execute(select(users.users)).one() == before


@pytest.mark.parametrize(
    ("name", "email"),
    [
        ("Alex Rivera-Stone", "alex@accountable.example"),
        ("Alex Rivera", "alex.rivera@accountable.example"),
        (None, "a"),
    ],
)
def test_remember_updates_a_changed_name_or_email(database, name, email):
    remember("u-1", "Alex Rivera", "alex@accountable.example")
    assert remember("u-1", name, email) is True
    assert everyone() == [("u-1", name, email)]


def test_remember_never_removes_anyone(database):
    remember("u-1", "Alex Rivera", "alex@accountable.example")
    remember("u-2", "Dana Whitfield", "dana@accountable.example")
    remember("u-1", "Alex Rivera", "alex@accountable.example")

    assert sorted(everyone()) == [
        ("u-1", "Alex Rivera", "alex@accountable.example"),
        ("u-2", "Dana Whitfield", "dana@accountable.example"),
    ]


def test_me_gives_the_signed_in_person(api):
    alex = TEAMMATES[0]
    reply = api.get("/api/me")
    assert reply.status_code == 200
    assert reply.json() == {"id": alex.id, "name": "Alex Rivera", "email": alex.email, "initials": "AR"}


def test_me_gives_the_email_as_the_name_of_someone_with_no_display_name(sign_in_as):
    robin = next(teammate for teammate in TEAMMATES if teammate.name is None)
    reply = sign_in_as(robin.id).get("/api/me")
    assert reply.json() == {"id": robin.id, "name": robin.email, "email": robin.email, "initials": "R"}
