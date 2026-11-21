from fastapi import APIRouter
from sqlalchemy import or_

from backend.app import clock, rules
from backend.app.db import Conn, deals
from backend.app.queries import deal_out, deal_select
from backend.app.schemas import Pipeline

router = APIRouter(prefix="/api", tags=["pipeline"])


@router.get("/pipeline", response_model=Pipeline)
def get_pipeline(conn: Conn):
    """Six columns in stage order. The open stages show every deal; Won and Lost
    show only those closed on or after today minus 30 days (PIPE-2)."""
    today = clock.today()
    shown = or_(deals.c.stage.in_(rules.OPEN_STAGES), deals.c.close_date >= rules.closed_window_start(today))
    rows = conn.execute(deal_select().where(shown).order_by(deals.c.position, deals.c.id))
    columns = {stage: [] for stage in rules.STAGES}
    for row in rows:
        columns[row.stage].append(deal_out(row, today))
    return {"columns": [{"stage": stage, "deals": columns[stage]} for stage in rules.STAGES]}
