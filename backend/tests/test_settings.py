from itertools import combinations

import pytest
from accountable import settings

ADDRESS = "postgresql://postgres.abc:secret-password@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
ALL_THREE = {
    "DATABASE_URL": ADDRESS,
    "SUPABASE_URL": "https://abc.supabase.co",
    "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abc",
}
SOME_BUT_NOT_ALL = [set(names) for size in (1, 2) for names in combinations(settings.NAMES, size)]


@pytest.fixture
def environment(monkeypatch):
    for name in settings.NAMES:
        monkeypatch.delenv(name, raising=False)

    def set_values(**values: str) -> None:
        for name, value in values.items():
            monkeypatch.setenv(name, value)

    return set_values


def test_none_of_the_settings_is_the_local_copy(environment):
    assert settings.load() is None


def test_blank_settings_count_as_missing(environment):
    environment(DATABASE_URL="", SUPABASE_URL="  ", SUPABASE_PUBLISHABLE_KEY="")
    assert settings.load() is None


def test_all_three_is_the_shared_app(environment):
    environment(**ALL_THREE)
    shared = settings.load()
    assert shared is not None
    assert shared.supabase_url == "https://abc.supabase.co"
    assert shared.supabase_publishable_key == "sb_publishable_abc"
    assert shared.database_url.host == "aws-0-us-west-1.pooler.supabase.com"


@pytest.mark.parametrize("present", SOME_BUT_NOT_ALL, ids=lambda names: "+".join(sorted(names)))
def test_some_but_not_all_stops_and_names_the_missing_ones(environment, present):
    environment(**{name: ALL_THREE[name] for name in present})
    with pytest.raises(settings.SettingsError) as stopped:
        settings.load()
    named = str(stopped.value).split("Missing: ")[1]
    assert {name for name in settings.NAMES if name in named} == set(settings.NAMES) - present


def test_the_missing_ones_are_listed_in_plain_words(environment):
    environment(DATABASE_URL=ADDRESS)
    with pytest.raises(settings.SettingsError, match=r"Missing: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY\.$"):
        settings.load()


@pytest.mark.parametrize("scheme", ["postgresql", "postgres", "postgresql+psycopg"])
def test_a_postgres_address_gets_the_psycopg_driver(environment, scheme):
    environment(**{**ALL_THREE, "DATABASE_URL": ADDRESS.replace("postgresql", scheme, 1)})
    shared = settings.load()
    assert shared is not None
    assert shared.database_url.drivername == "postgresql+psycopg"
    assert shared.database_url.password == "secret-password"


def test_the_address_hides_its_password_when_printed(environment):
    environment(**ALL_THREE)
    assert "secret-password" not in repr(settings.load())


def test_the_supabase_address_loses_a_trailing_slash(environment):
    environment(**{**ALL_THREE, "SUPABASE_URL": "https://abc.supabase.co/"})
    shared = settings.load()
    assert shared is not None
    assert shared.supabase_url == "https://abc.supabase.co"


@pytest.mark.parametrize(
    "address",
    ["sqlite:///secret-password.db", "mysql://user:secret-password@host/db", "not an address secret-password"],
)
def test_an_address_that_isnt_postgres_stops_without_repeating_it(environment, address):
    environment(**{**ALL_THREE, "DATABASE_URL": address})
    with pytest.raises(settings.SettingsError) as stopped:
        settings.load()
    assert "DATABASE_URL" in str(stopped.value)
    assert "secret-password" not in str(stopped.value)
