# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.28", "psycopg[binary]>=3.2", "python-dotenv>=1.0"]
# ///
"""Check the Supabase settings in .env before you build with them.

From the accountable folder:

    uv run course/check_supabase.py

It reads DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from .env, connects to the database
and asks Supabase Auth for its settings. It changes nothing, and it never prints your password or key.
"""

import re
import sys
from importlib import import_module
from pathlib import Path

# uv installs these three from the list at the top of this file, not into the project.
# A plain import fails the project's type check where the project doesn't have them,
# and a skip comment fails it where the project does, so this file loads them by name.
httpx = import_module("httpx")
psycopg = import_module("psycopg")
dotenv_values = import_module("dotenv").dotenv_values

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
NAMES = ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")
EXAMPLE_PARTS = ("abcdefghijklmnopqrst", "your-database-password", "YOUR-PASSWORD", "your-key")
URL_SAFE = re.compile(r"(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+")
PROJECT_URL = re.compile(r"https://([a-z0-9]+)\.supabase\.co/?")

problems: list[str] = []


def ok(message: str) -> None:
    print(f"  ok   {message}")


def fix(message: str) -> None:
    problems.append(message)
    print(f"  FIX  {message}")


def read_settings() -> dict[str, str]:
    """The three settings from .env that are filled in with real values."""
    values = dotenv_values(ENV_FILE)
    settings = {}
    for name in NAMES:
        value = (values.get(name) or "").strip()
        if not value:
            fix(missing(name, values))
        elif pasted := re.match(r"[A-Z_]+=", value):
            fix(f"{name} has {pasted.group()} pasted in front of its value. Keep only the value after it.")
        elif "YOUR-PASSWORD" in value:
            fix(
                f"{name} still has [YOUR-PASSWORD] in it. Put your database password there, replacing the brackets too."
            )
        elif any(part in value for part in EXAMPLE_PARTS):
            fix(f"{name} still has part of the example in it. Use your own value from Supabase.")
        else:
            settings[name] = value
    return settings


def missing(name: str, values: dict[str, str | None]) -> str:
    """Explain a missing setting, spotting one saved under the name Supabase shows for a framework."""
    if name.startswith("SUPABASE_"):
        kind = name.rsplit("_", 1)[-1]
        for other in values:
            if other != name and "SUPABASE" in other and other.endswith(kind):
                return f"{name} is missing from .env, which has {other} instead. Rename it to {name}."
    return f"{name} is missing from .env."


def check_database_url(url: str) -> str | None:
    """Check the connection string's shape. Returns the project's ref, or None if it can't be used."""
    copy_again = "Copy it again from Connect, Session pooler."
    scheme, _, rest = url.partition("://")
    user_info, _, address = rest.rpartition("@")
    user, _, password = user_info.partition(":")
    if scheme not in ("postgresql", "postgres") or not password:
        fix(f"DATABASE_URL doesn't look like postgresql://user:password@host:5432/postgres. {copy_again}")
        return None
    if "[" in url or "]" in url:
        fix("DATABASE_URL still has the square brackets from [YOUR-PASSWORD] around your password. Take them out.")
        return None
    if not URL_SAFE.fullmatch(password):
        fix(
            "The password in DATABASE_URL has a character that can break the address, such as @ : / ? # or a space. "
            "Reset the database password in Supabase's Database Settings to one with only letters and numbers."
        )
        return None
    host, _, port = address.partition("/")[0].partition(":")
    if host.startswith("db.") and host.endswith(".supabase.co"):
        fix(f"DATABASE_URL is the direct connection, which many networks can't reach. {copy_again}")
        return None
    if not host.endswith(".pooler.supabase.com") or port != "5432":
        fix(f"DATABASE_URL should be the session pooler, a pooler.supabase.com address on port 5432. {copy_again}")
        return None
    ref = user.removeprefix("postgres.")
    if ref == user:
        fix(f"The user in DATABASE_URL should be postgres, a dot and your project's ref. {copy_again}")
        return None
    ok(f"DATABASE_URL is the session pooler for project {ref}")
    return ref


def check_project_url(url: str, ref: str | None) -> bool:
    match = PROJECT_URL.fullmatch(url)
    if not match:
        fix("SUPABASE_URL should look like https://abcdefghijklmnopqrst.supabase.co with your project's ref.")
        return False
    if ref and match.group(1) != ref:
        fix(f"SUPABASE_URL is for project {match.group(1)} and DATABASE_URL for {ref}. Use one project for both.")
        return False
    ok(f"SUPABASE_URL is project {match.group(1)}")
    return True


def check_key(key: str) -> bool:
    if key.startswith("sb_secret_"):
        fix("SUPABASE_PUBLISHABLE_KEY is a secret key, which must never reach the browser. Use the publishable key.")
        return False
    if not key.startswith("sb_publishable_"):
        fix("SUPABASE_PUBLISHABLE_KEY should start with sb_publishable_. It's in Settings, under API Keys.")
        return False
    ok("SUPABASE_PUBLISHABLE_KEY is a publishable key")
    return True


def check_database(url: str) -> None:
    try:
        with psycopg.connect(url, connect_timeout=15) as connection:
            connection.execute("select 1")
            version = connection.info.parameter_status("server_version")
    except psycopg.OperationalError as error:
        message = str(error)
        if "password authentication failed" in message:
            fix("Supabase refused the database password. Check it, or reset it in Supabase's Database Settings.")
        elif re.search(r"tenant.*not found", message, re.IGNORECASE):
            fix("Supabase doesn't recognize the user or region in DATABASE_URL. Copy it again from Connect.")
        else:
            fix(f"Couldn't connect to the database: {message.strip().splitlines()[-1]}")
        return
    ok(f"Connected to the database (Postgres {version})")


def check_auth(url: str, key: str) -> None:
    try:
        response = httpx.get(f"{url.rstrip('/')}/auth/v1/settings", headers={"apikey": key}, timeout=15)
    except httpx.HTTPError as error:
        fix(f"Couldn't reach Supabase at SUPABASE_URL: {error}")
        return
    if response.status_code == 401:
        fix("Supabase didn't accept the publishable key. Copy it again from the same project as SUPABASE_URL.")
        return
    if response.status_code != 200:
        fix(f"Supabase Auth answered {response.status_code}. Check SUPABASE_URL.")
        return
    ok("Supabase Auth accepted the publishable key")
    if response.json().get("disable_signup"):
        ok("Sign-ups are off")
    else:
        fix("Sign-ups are on. In Authentication, Sign In / Providers, turn off Allow new users to sign up and save.")


def main() -> int:
    print(f"Checking {ENV_FILE}\n")
    if not ENV_FILE.exists():
        print("There's no .env file there yet. Create it with the three lines from Set up Supabase.")
        return 1
    settings = read_settings()
    ref = None
    if "DATABASE_URL" in settings:
        ref = check_database_url(settings["DATABASE_URL"])
    url_ok = "SUPABASE_URL" in settings and check_project_url(settings["SUPABASE_URL"], ref)
    key_ok = "SUPABASE_PUBLISHABLE_KEY" in settings and check_key(settings["SUPABASE_PUBLISHABLE_KEY"])
    if ref:
        check_database(settings["DATABASE_URL"])
    if url_ok and key_ok:
        check_auth(settings["SUPABASE_URL"], settings["SUPABASE_PUBLISHABLE_KEY"])
    if problems:
        print(f"\n{len(problems)} to fix. Change .env and run this again.")
        return 1
    print("\nAll good. Your .env is ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
