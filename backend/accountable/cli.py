"""The seed and empty commands, run with `npm run seed` or `npm run empty`, which call
`uv run python -m accountable.cli seed` or `empty`.

Both delete rows inside one transaction and leave the file and tables in place,
which is why they're safe with the app running and why an emptied database isn't
treated as new. They leave the users table alone, so the made-up teammates are
still there to sign in as. Seed puts the sample company's settings back, and empty
leaves the settings alone, because they're the business's details, not records (C4).

They only ever touch the local copy. npm run seed and npm run empty already leave
the shared app's settings out, and refusing here as well means no slip in a script
can wipe the team's data.
"""

import argparse
import os
import sys

from sqlalchemy import Connection, delete, func, select

from accountable import db, users
from accountable.company import sample_data as sample_company
from accountable.crm import sample_data
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes


def fill_sample(conn: Connection) -> None:
    """The sample data, dated from today in the team's zone, which is what the shared app's first start uses too.

    The sample company's settings come with it, so only a new database or a seed ever gets them (B12, B13).
    """
    sample_data.fill(conn, db.local_today())
    sample_company.fill(conn, db.utc_now())


def _counts(conn: Connection) -> dict[str, int]:
    return {
        table.name: conn.execute(select(func.count()).select_from(table)).scalar_one()
        for table in (organizations, contacts, deals, activities)
    }


def _plural(count: int, name: str) -> str:
    if count == 1:
        return f"1 {name[:-3]}y" if name.endswith("ies") else f"1 {name[:-1]}"
    return f"{count} {name}"


def _reaches_the_shared_app() -> bool:
    return "DATABASE_URL" in os.environ


def _wipe(conn: Connection) -> None:
    for table in (activities, stage_changes, deals, contacts, organizations):
        conn.execute(delete(table))


def _confirmed() -> bool:
    try:
        return input("Type yes to go ahead: ").strip().lower() == "yes"
    except EOFError:
        print("\nNobody answered.")
        return False


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="accountable.cli")
    parser.add_argument("command", choices=["seed", "empty"])
    parser.add_argument("--yes", action="store_true", help="skip the question")
    options = parser.parse_args(arguments)
    seeding = options.command == "seed"

    if _reaches_the_shared_app():
        print(
            "DATABASE_URL is set, so this could reach the team's data. "
            "Seed and empty only work on the local copy, so nothing was changed.",
            file=sys.stderr,
        )
        return 2

    # An empty database still has the made-up teammates, so there's someone to sign in as.
    built = db.prepare_database(fill_sample if seeding else users.add_missing_teammates)
    if built:
        print("Sample data added." if seeding else "Database emptied.")
        return 0

    with db.reading() as conn:
        counts = _counts(conn)

    outcome = "replaced with the sample data" if seeding else "removed for good"
    lost = ", ".join(_plural(count, name) for name, count in counts.items())
    print(f"This will delete {lost}. They'll be {outcome}, and this can't be undone.")
    if seeding:
        print("The company settings will be replaced with the sample company's.")

    if not options.yes and not _confirmed():
        print("Nothing was changed.")
        return 1

    with db.writing() as conn:
        _wipe(conn)
        if seeding:
            fill_sample(conn)

    print("Sample data restored." if seeding else "Database emptied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
