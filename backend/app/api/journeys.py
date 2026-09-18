"""The two-endpoint contract (docs/backend-design.md §3) plus the demo scenario switch."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app import config
from app.clients.datamall import train_service_alerts
from app.clients.onemap import OneMapClient
from app.models import Journey, PlanRequest, RefreshRequest, RefreshResponse
from app.scenarios import SCENARIO_DEFS, ScenarioState
from app.services import planner, refresh
from app.store import JourneyStore, StoredJourney

router = APIRouter(prefix="/api")
SGT = timezone(timedelta(hours=8))

STORE = JourneyStore()
SCENARIOS = ScenarioState()
_onemap = OneMapClient()

# Module-level indirection so tests (and later the poller/cache) can substitute the feeds.
route_candidates = _onemap.route_candidates


def _now() -> datetime:
    return datetime.now(tz=SGT)


def _places(req: PlanRequest):
    try:
        return config.SAVED_PLACES[req.origin], config.SAVED_PLACES[req.destination]
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Unknown place id {e.args[0]!r}. "
                                                    f"Known: {sorted(config.SAVED_PLACES)}") from e


@router.post("/journeys/plan", response_model=Journey, response_model_by_alias=True)
async def plan(req: PlanRequest) -> Journey:
    origin, destination = _places(req)
    try:
        raw = await route_candidates(origin, destination, req.arrive_by)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing provider unavailable: {e}") from e
    if not raw:
        raise HTTPException(status_code=502, detail="Routing provider returned no itineraries")
    journey = planner.build_journey(req, raw, origin=origin, destination=destination, now=_now())
    STORE.put(journey.id, StoredJourney(request=req, raw_itineraries=raw, version=journey.version,
                                        created_at=journey.updated_at))
    return journey


@router.post("/journeys/{journey_id}/refresh", response_model=RefreshResponse, response_model_by_alias=True)
async def refresh_journey(journey_id: str, body: RefreshRequest) -> RefreshResponse:
    stored = STORE.get(journey_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Unknown journey")
    origin, destination = _places(stored.request)

    scenario = SCENARIOS.scenario
    if scenario is not None:
        alerts_raw, source = scenario.train_alerts, "simulated"
    else:
        try:
            alerts_raw, source = await train_service_alerts(), "live"
        except Exception:
            alerts_raw, source = None, "live"  # evaluate() reports freshness=unknown, never all-clear

    out = refresh.evaluate(req=stored.request, raw_itineraries=stored.raw_itineraries,
                           train_alerts_raw=alerts_raw, alerts_data_source=source,
                           origin=origin, destination=destination,
                           journey_id=journey_id, current_version=stored.version, now=_now())
    if out.journey is not None:
        STORE.bump_version(journey_id, out.journey.version)
    return out


@router.get("/scenarios")
async def list_scenarios():
    return {"active": SCENARIOS.active,
            "scenarios": [{"name": s.name, "title": s.title.model_dump()} for s in SCENARIO_DEFS.values()]}


@router.post("/scenarios/deactivate")
async def deactivate_scenario():
    SCENARIOS.deactivate()
    return {"active": None}


@router.post("/scenarios/{name}/activate")
async def activate_scenario(name: str):
    if name not in SCENARIO_DEFS:
        raise HTTPException(status_code=404, detail=f"Unknown scenario. Known: {sorted(SCENARIO_DEFS)}")
    SCENARIOS.activate(name)
    return {"active": name}
