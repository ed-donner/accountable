from fastapi import APIRouter

from backend.app import clock

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/meta")
def get_meta() -> dict:
    return {"today": clock.today().isoformat()}
