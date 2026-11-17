"""Only mounted while ACCOUNTABLE_TESTING=1: lets the end-to-end tests reset the data."""

from fastapi import APIRouter

from app import config
from app.db import engine_for
from app.deps import Today
from app.seed import seed

router = APIRouter(tags=["testing"], include_in_schema=False)


@router.post("/testing/reset", status_code=204)
def reset(today: Today) -> None:
    seed(engine_for(config.db_path()), today)
