"""The two-endpoint contract (docs/backend-design.md §3) plus the demo scenario switch."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app import config
from app.clients.datamall import facilities_maintenance, train_service_alerts
from app.clients.onemap import OneMapClient
from app.clients.weather import two_hour_forecast
from app.models import Journey, Place, PlacePin, PlanRequest, RefreshRequest, RefreshResponse
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
geocode_search = _onemap.search
reverse_geocode = _onemap.reverse_geocode


def _now() -> datetime:
    return datetime.now(tz=SGT)


def _resolve(place: str | PlacePin) -> Place:
    if isinstance(place, PlacePin):
        from app.models import Text
        return Place(lat=place.lat, lon=place.lon, name=Text(en=place.name, zh=place.name))
    try:
        return config.SAVED_PLACES[place]
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Unknown place id {place!r}. "
                                                    f"Known: {sorted(config.SAVED_PLACES)}") from e


def _places(req: PlanRequest):
    return _resolve(req.origin), _resolve(req.destination)


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
    data_mode = "simulated" if source == "simulated" else "live"
    now = _now()
    ranked = planner.rank([convert(r, pace_factor=req.walking_speed_factor,
                                   origin=origin, destination=destination) for r in raw])
    journey = planner.assemble(req, ranked[0], now=now, data_mode=data_mode,
                               origin=origin, destination=destination)
    STORE.put(journey.id, StoredJourney(request=req, raw_itineraries=raw, version=journey.version,
                                        created_at=now, chosen_index=0))

    # Genuinely different alternatives (a different set of travel modes), for the setup
    # route choice. Each gets its own id so refreshing it protects that route.
    seen_modes = {frozenset(s.mode for s in ranked[0].steps)}
    for index, candidate in enumerate(ranked[1:], start=1):
        modes = frozenset(s.mode for s in candidate.steps)
        if modes in seen_modes or len(journey.alternatives) >= 2:
            continue
        seen_modes.add(modes)
        alternative = planner.assemble(req, candidate, now=now, data_mode=data_mode,
                                       origin=origin, destination=destination)
        STORE.put(alternative.id, StoredJourney(request=req, raw_itineraries=raw,
                                                version=alternative.version, created_at=now,
                                                chosen_index=index))
        journey.alternatives.append(alternative)

    # Attach today's context to the plan so the first screen already tells the whole story.
    if train_raw is not None:
        journey.alerts += conditions.train_alerts_for(ranked[0], train_raw, data_source=source)
    journey.alerts += refresh._side_alerts(ranked[0], lifts_raw, weather_raw, origin, destination, source)
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
                           journey_id=journey_id, current_version=stored.version, now=_now(),
                           facilities_raw=lifts_raw, weather_raw=weather_raw,
                           chosen_index=stored.chosen_index)
    if out.journey is not None:
        STORE.bump_version(journey_id, out.journey.version)
    return out


@router.get("/geocode")
async def geocode(q: str):
    """Address / place search for the trip planner. Names are title-cased for display."""
    try:
        rows = await geocode_search(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Search provider unavailable: {e}") from e
    results = []
    for row in rows[:8]:
        try:
            results.append({
                "name": (row.get("SEARCHVAL") or "").title(),
                "address": (row.get("ADDRESS") or "").title(),
                "lat": float(row["LATITUDE"]), "lon": float(row["LONGITUDE"]),
            })
        except (KeyError, ValueError):
            continue
    return {"results": results}


@router.get("/revgeocode")
async def revgeocode(lat: float, lon: float):
    """Name the nearest place for a coordinate — 'where am I' for the lost-elder flow."""
    try:
        rows = await reverse_geocode(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Reverse geocoding unavailable: {e}") from e

    def clean(value):
        value = (value or "").strip()
        return "" if value.lower() == "null" else value

    for row in rows:
        building = clean(row.get("BUILDINGNAME"))
        if building:
            return {"name": building.title()}
    for row in rows:
        block, road = clean(row.get("BLOCK")), clean(row.get("ROAD"))
        if road:
            return {"name": (f"Blk {block} " if block else "") + road.title()}
    return {"name": None}


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
