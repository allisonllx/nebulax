"""The two-endpoint contract (docs/backend-design.md §3) plus the demo scenario switch."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app import config
from app.clients.datamall import facilities_maintenance, train_service_alerts
from app.clients.onemap import OneMapClient
from app.clients.weather import two_hour_forecast
from app.models import Journey, Place, PlanRequest, RefreshRequest, RefreshResponse
from app.scenarios import SCENARIO_DEFS, ScenarioState
from app.services import conditions, planner, refresh
from app.services.itinerary import convert
from app.store import JourneyStore, StoredJourney

router = APIRouter(prefix="/api")
SGT = timezone(timedelta(hours=8))

STORE = JourneyStore()
SCENARIOS = ScenarioState()
_onemap = OneMapClient()

# Module-level indirection so tests (and later a poller/cache) can substitute the feeds.
route_candidates = _onemap.route_candidates


def _now() -> datetime:
    return datetime.now(tz=SGT)


def _places(req: PlanRequest):
    try:
        return config.SAVED_PLACES[req.origin], config.SAVED_PLACES[req.destination]
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Unknown place id {e.args[0]!r}. "
                                                    f"Known: {sorted(config.SAVED_PLACES)}") from e


async def _feeds():
    """(train_alerts_raw, facilities_raw, weather_raw, data_source). A scenario overrides only the
    feeds it defines; a feed that cannot be read comes back as None, which is never an all-clear."""
    scenario = SCENARIOS.scenario

    async def fetch(override, live_call):
        if override is not None:
            return override
        try:
            return await live_call()
        except Exception:
            return None

    if scenario is not None:
        train = scenario.train_alerts if scenario.train_alerts is not None else await fetch(None, train_service_alerts)
        lifts = scenario.facilities if scenario.facilities is not None else await fetch(None, facilities_maintenance)
        rain = scenario.weather if scenario.weather is not None else await fetch(None, two_hour_forecast)
        return train, lifts, rain, "simulated"
    return (await fetch(None, train_service_alerts), await fetch(None, facilities_maintenance),
            await fetch(None, two_hour_forecast), "live")


def _side_alerts(plan, lifts_raw, weather_raw, origin: Place, destination: Place, source: str):
    """Lift and rain warnings: they inform the traveller but do not invalidate a route."""
    alerts = []
    if lifts_raw is not None:
        alerts += conditions.lift_alerts_for(plan, lifts_raw, data_source=source)
    if weather_raw is not None:
        alerts += conditions.weather_alerts_for(plan, weather_raw, origin=origin,
                                                destination=destination, data_source=source)
    return alerts


@router.post("/journeys/plan", response_model=Journey, response_model_by_alias=True)
async def plan(req: PlanRequest) -> Journey:
    origin, destination = _places(req)
    try:
        raw = await route_candidates(origin, destination, req.arrive_by)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing provider unavailable: {e}") from e
    if not raw:
        raise HTTPException(status_code=502, detail="Routing provider returned no itineraries")

    train_raw, lifts_raw, weather_raw, source = await _feeds()
    journey = planner.build_journey(req, raw, origin=origin, destination=destination, now=_now(),
                                    data_mode="simulated" if source == "simulated" else "live")
    best = convert(raw[0], pace_factor=req.walking_speed_factor, origin=origin, destination=destination)
    # Attach today's context to the plan so the first screen already tells the whole story.
    ranked_best = planner.rank([convert(r, pace_factor=req.walking_speed_factor,
                                        origin=origin, destination=destination) for r in raw])[0]
    if train_raw is not None:
        journey.alerts += conditions.train_alerts_for(ranked_best, train_raw, data_source=source)
    journey.alerts += _side_alerts(ranked_best, lifts_raw, weather_raw, origin, destination, source)

    STORE.put(journey.id, StoredJourney(request=req, raw_itineraries=raw, version=journey.version,
                                        created_at=journey.updated_at))
    return journey


@router.post("/journeys/{journey_id}/refresh", response_model=RefreshResponse, response_model_by_alias=True)
async def refresh_journey(journey_id: str, body: RefreshRequest) -> RefreshResponse:
    stored = STORE.get(journey_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Unknown journey")
    origin, destination = _places(stored.request)

    train_raw, lifts_raw, weather_raw, source = await _feeds()
    out = refresh.evaluate(req=stored.request, raw_itineraries=stored.raw_itineraries,
                           train_alerts_raw=train_raw, alerts_data_source=source,
                           origin=origin, destination=destination,
                           journey_id=journey_id, current_version=stored.version, now=_now())

    # Whatever the outcome, carry today's lift and rain warnings for the route he is on.
    current = planner.rank([convert(r, pace_factor=stored.request.walking_speed_factor,
                                    origin=origin, destination=destination)
                            for r in stored.raw_itineraries])[0]
    side = _side_alerts(current, lifts_raw, weather_raw, origin, destination, source)
    if out.journey is not None:
        out.journey.alerts += side
        STORE.bump_version(journey_id, out.journey.version)
    else:
        out.alerts += side
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
