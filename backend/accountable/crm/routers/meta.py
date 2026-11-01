from fastapi import APIRouter

from accountable.crm import rules

router = APIRouter()


@router.get("/meta")
def meta():
    return {
        "stages": [
            {
                "key": stage,
                "name": rules.STAGE_NAMES[stage],
                "probability": rules.USUAL_PROBABILITY[stage],
                "open": stage in rules.OPEN_STAGES,
            }
            for stage in rules.STAGES
        ],
        "statuses": rules.CONTACT_STATUSES,
        "activity_types": rules.ACTIVITY_TYPES,
    }
