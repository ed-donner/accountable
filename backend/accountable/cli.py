"""The seed and empty commands, run as `python -m accountable.cli seed` or `empty`.

Both delete rows inside one transaction and leave the file and tables in place,
which is why they're safe with the app running and why an emptied database isn't
treated as new.
"""

import argparse
import sys
from datetime import date

from sqlalchemy import Connection, delete, func, select

from accountable import db
from accountable.crm import sample_data
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes


def fill_sample(conn: Connection) -> None:
    sample_data.fill(conn, date.today())


def _nothing(_conn: Connection) -> None:
    pass


def _counts(conn: Connection) -> dict[str, int]:
    return {
        "organizations": conn.scalar(select(func.count()).select_from(organizations)),
        "contacts": conn.scalar(select(func.count()).select_from(contacts)),
        "deals": conn.scalar(select(func.count()).select_from(deals)),
        "activities": conn.scalar(select(func.count()).select_from(activities)),
    }


def _plural(count: int, name: str) -> str:
    if count == 1:
        return f"1 {name[:-3]}y" if name.endswith("ies") else f"1 {name[:-1]}"
    return f"{count} {name}"


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

    built = db.prepare_database(fill_sample if seeding else _nothing)
    if built:
        print("Sample data added." if seeding else "Database emptied.")
        return 0

    with db.reading() as conn:
        counts = _counts(conn)

    outcome = "replaced with the sample data" if seeding else "removed for good"
    lost = ", ".join(_plural(count, name) for name, count in counts.items())
    print(f"This will delete {lost}. They'll be {outcome}, and this can't be undone.")

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
