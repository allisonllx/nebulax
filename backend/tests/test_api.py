import pytest
from fastapi.testclient import TestClient

import app.api.journeys as journeys_api
from main import app
from tests.conftest import load
from tests.test_conditions import NORMAL_DAY, disruption

PLAN_BODY = {"origin": "saved-home", "destination": "ttsh-entrance",
             "arriveBy": "2026-09-21T10:00:00+08:00", "stepFree": True, "walkingSpeedFactor": 0.6}


@pytest.fixture
def client(monkeypatch):
    transit = load("onemap_transit.json")["plan"]["itineraries"]
    bus = load("onemap_bus.json")["plan"]["itineraries"]

    async def fake_route_candidates(origin, destination, arrive_by):
        return transit + bus

    async def fake_train_alerts():
        return NORMAL_DAY

    async def fake_facilities():
        return {"value": []}

    async def fake_weather():
        return {"data": {"area_metadata": [], "items": []}}

    monkeypatch.setattr(journeys_api, "route_candidates", fake_route_candidates)
    monkeypatch.setattr(journeys_api, "train_service_alerts", fake_train_alerts)
    monkeypatch.setattr(journeys_api, "facilities_maintenance", fake_facilities)
    monkeypatch.setattr(journeys_api, "two_hour_forecast", fake_weather)
    journeys_api.SCENARIOS.deactivate()
    with TestClient(app) as c:
        yield c
    journeys_api.SCENARIOS.deactivate()


def test_plan_returns_a_full_journey_in_the_agreed_shape(client):
    r = client.post("/api/journeys/plan", json=PLAN_BODY)

    assert r.status_code == 200
    j = r.json()
    assert j["dataMode"] == "live" and j["version"] == 1
    assert j["departureTime"] < j["arrivalWindow"]["earliest"] < j["arrivalWindow"]["latest"]
    assert j["steps"][0]["instruction"]["zh"].startswith("步行")
    assert j["routeGeometry"]["type"] == "FeatureCollection"
    assert j["alerts"] == []


def test_refresh_unknown_journey_is_404(client):
    r = client.post("/api/journeys/trip-nope/refresh", json={"version": 1})

    assert r.status_code == 404


def test_refresh_quiet_day_is_unchanged(client):
    trip = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    r = client.post(f"/api/journeys/{trip['id']}/refresh", json={"version": trip["version"]})

    assert r.status_code == 200
    assert r.json() == {"result": "unchanged", "status": "unchanged",
                        "checkedAt": r.json()["checkedAt"],
                        "dataFreshness": "fresh", "journey": None, "message": None,
                        "alerts": [], "helpActions": []}


def test_activating_the_disruption_scenario_changes_refresh_and_labels_it(client):
    trip = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    assert client.post("/api/scenarios/nsl_disruption/activate").status_code == 200
    r = client.post(f"/api/journeys/{trip['id']}/refresh", json={"version": trip["version"]})

    body = r.json()
    assert body["result"] == "replacement_available"
    assert body["journey"]["dataMode"] == "simulated"
    assert body["journey"]["version"] == trip["version"] + 1
    modes = {s["mode"] for s in body["journey"]["steps"]}
    assert "train" not in modes


def test_scenarios_can_be_listed_and_deactivated(client):
    r = client.get("/api/scenarios")

    names = {s["name"] for s in r.json()["scenarios"]}
    assert "nsl_disruption" in names
    assert client.post("/api/scenarios/deactivate").status_code == 200
    assert r.json()["active"] is None


def test_a_dead_feed_reports_unknown_freshness(client, monkeypatch):
    trip = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    async def broken_alerts():
        raise RuntimeError("timeout")

    monkeypatch.setattr(journeys_api, "train_service_alerts", broken_alerts)
    r = client.post(f"/api/journeys/{trip['id']}/refresh", json={"version": trip["version"]})

    assert r.status_code == 200
    assert r.json()["result"] == "unchanged"
    assert r.json()["dataFreshness"] == "unknown"


def test_refresh_unchanged_still_reports_lift_and_rain_warnings(client, monkeypatch):
    trip = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    assert client.post("/api/scenarios/novena_lift_out/activate").status_code == 200
    r = client.post(f"/api/journeys/{trip['id']}/refresh", json={"version": trip["version"]})

    body = r.json()
    assert body["result"] == "unchanged"           # route itself is still fine
    types = {a["type"] for a in body["alerts"]}
    assert "lift_maintenance" in types
    lift = next(a for a in body["alerts"] if a["type"] == "lift_maintenance")
    assert lift["dataSource"] == "simulated"
    assert "Exit A" in lift["message"]["en"]


def test_plan_attaches_current_warnings_to_the_journey(client):
    assert client.post("/api/scenarios/heavy_rain/activate").status_code == 200

    j = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    assert j["dataMode"] == "simulated"
    assert any(a["type"] == "weather" for a in j["alerts"])


def test_journey_steps_carry_the_ui_fields(client):
    j = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    for step in j["steps"]:
        assert step["mode"] in {"walk", "bus", "train"}
        assert step["detail"]["en"] and step["detail"]["zh"]
        assert step["confirmation"]["en"] and step["confirmation"]["zh"]
        assert step["place"]["en"] and step["place"]["zh"]
        assert isinstance(step["durationMinutes"], int) and step["durationMinutes"] >= 0
    for feature in j["routeGeometry"]["features"]:
        assert feature["properties"]["mode"] in {"walk", "bus", "train"}
        assert isinstance(feature["properties"]["affected"], bool)


def test_refresh_response_also_carries_status_alias(client):
    trip = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    r = client.post(f"/api/journeys/{trip['id']}/refresh", json={"version": trip["version"]})

    body = r.json()
    assert body["status"] == body["result"] == "unchanged"


def test_plan_offers_alternative_routes(client):
    j = client.post("/api/journeys/plan", json=PLAN_BODY).json()

    assert len(j["alternatives"]) >= 1
    modes_main = {s["mode"] for s in j["steps"]}
    modes_alt = {s["mode"] for s in j["alternatives"][0]["steps"]}
    assert modes_main != modes_alt          # a genuinely different way to travel
    assert j["alternatives"][0]["id"] != j["id"]


def test_choosing_the_bus_alternative_changes_what_refresh_protects(client):
    j = client.post("/api/journeys/plan", json=PLAN_BODY).json()
    bus = next(a for a in j["alternatives"]
               if all(s["mode"] != "train" for s in a["steps"]))

    client.post("/api/scenarios/nsl_disruption/activate")
    on_mrt = client.post(f"/api/journeys/{j['id']}/refresh", json={"version": 1}).json()
    on_bus = client.post(f"/api/journeys/{bus['id']}/refresh", json={"version": 1}).json()

    assert on_mrt["result"] == "replacement_available"   # his route is broken
    assert on_bus["result"] == "unchanged"               # the chosen bus route is not


def test_plan_accepts_a_custom_origin_and_destination(client):
    body = {**PLAN_BODY,
            "origin": {"lat": 1.3521, "lon": 103.8198, "name": "Toa Payoh Hub"},
            "destination": {"lat": 1.2996, "lon": 103.8455, "name": "Singapore General Hospital"}}

    r = client.post("/api/journeys/plan", json=body)

    assert r.status_code == 200
    j = r.json()
    assert j["steps"][-1]["instruction"]["en"].rstrip(".").endswith("Singapore General Hospital")
    assert len(j["routeGeometry"]["features"]) >= 1


def test_geocode_proxies_the_search_provider(client, monkeypatch):
    async def fake_search(q):
        return [{"SEARCHVAL": "TAN TOCK SENG HOSPITAL", "ADDRESS": "11 JALAN TAN TOCK SENG",
                 "LATITUDE": "1.3214", "LONGITUDE": "103.8459"}]

    monkeypatch.setattr(journeys_api, "geocode_search", fake_search)
    r = client.get("/api/geocode", params={"q": "tan tock seng"})

    assert r.status_code == 200
    hit = r.json()["results"][0]
    assert hit == {"name": "Tan Tock Seng Hospital", "address": "11 Jalan Tan Tock Seng",
                   "lat": 1.3214, "lon": 103.8459}


def test_journey_names_its_own_endpoints(client):
    body = {**PLAN_BODY,
            "origin": {"lat": 1.3521, "lon": 103.8198, "name": "Toa Payoh Hub"},
            "destination": {"lat": 1.2996, "lon": 103.8455, "name": "Singapore General Hospital"}}

    j = client.post("/api/journeys/plan", json=body).json()

    assert j["origin"]["name"]["en"] == "Toa Payoh Hub"
    assert j["destination"]["name"]["en"] == "Singapore General Hospital"
