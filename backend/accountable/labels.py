"""What an area calls its records, for the books' entries (X13): an invoice's number, a bill's number
and supplier. Each area that names records gives a Labels for each kind of entry it posts, and main.py
puts them on the app, so the books name no area, as the cash flow names none (cash.py).
"""

from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import Connection

Labels = Callable[[Connection, Sequence[int]], Mapping[int, str]]
"""Given a connection and ids, a name for each id that still exists, in one read."""


def app_labels(request: Request) -> Mapping[str, Labels]:
    """Every area's labels by the kind of entry, which main.py puts on the app. Tests can stand in for it."""
    return request.app.state.labels


AppLabels = Annotated[Mapping[str, Labels], Depends(app_labels)]


def names_of(
    conn: Connection, labels: Mapping[str, Labels], entries: Iterable[tuple[str, int]]
) -> dict[tuple[str, int], str]:
    """A name for each (kind, source id) that has one: one read for each kind, however many ids."""
    wanted: dict[str, set[int]] = {}
    for kind, source_id in entries:
        if kind in labels:
            wanted.setdefault(kind, set()).add(source_id)
    return {
        (kind, source_id): name
        for kind, ids in wanted.items()
        for source_id, name in labels[kind](conn, sorted(ids)).items()
    }
