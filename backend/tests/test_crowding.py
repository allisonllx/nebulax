"""Crowding and lift outages must change what the app does, not just what it says."""
from app.config import SAVED_PLACES
from app.services import itinerary
from app.services.conditions import crowd_alerts_for, lift_alerts_for

CROWDED_NSL = {"value": [
    {"Station": "NS16", "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "h"},
    {"Station": "NS17", "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "l"},
    {"Station": "NS20", "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "m"},
]}
QUIET_NSL = {"value": [
    {"Station": code, "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "l"}
    for code in ("NS16", "NS17", "NS18", "NS19", "NS20")
]}
NOVENA_LIFT_OUT = {"value": [
    {"Line": "NSL", "StationCode": "NS20", "StationName": "Novena",
     "LiftID": "B1L01", "LiftDesc": "Exit A Street level - Concourse"},
]}


def plan_of(raw):
    return itinerary.convert(raw, pace_factor=0.6, origin=SAVED_PLACES["saved-home"],
                             destination=SAVED_PLACES["ttsh-entrance"])


def test_a_quiet_platform_raises_nothing(mrt_itinerary):
    assert crowd_alerts_for(plan_of(mrt_itinerary), {"NSL": QUIET_NSL}, data_source="live") == []


def test_a_crowded_boarding_platform_is_flagged_against_his_rail_leg(mrt_itinerary):
    plan = plan_of(mrt_itinerary)

    alerts = crowd_alerts_for(plan, {"NSL": CROWDED_NSL}, data_source="live")

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.type == "crowding"
    assert alert.station_codes == ["NS16"]
    # It must be able to invalidate the leg, not just decorate the screen.
    assert alert.affected_leg_ids == [next(s.leg_id for s in plan.steps if s.mode == "train")]
    assert "拥挤" in alert.message.zh or "挤" in alert.message.zh
    assert "crowded" in alert.message.en.lower()


def test_crowding_on_a_line_he_does_not_ride_is_ignored(bus_itineraries):
    direct_bus = min(bus_itineraries, key=lambda i: i["transfers"])

    assert crowd_alerts_for(plan_of(direct_bus), {"NSL": CROWDED_NSL}, data_source="live") == []


def test_a_lift_outage_now_names_the_rail_leg_it_threatens(mrt_itinerary):
    plan = plan_of(mrt_itinerary)

    alerts = lift_alerts_for(plan, NOVENA_LIFT_OUT, data_source="live")

    assert len(alerts) == 1
    assert alerts[0].affected_leg_ids == [next(s.leg_id for s in plan.steps if s.mode == "train")]


def test_a_lift_outage_makes_refresh_offer_a_route_that_needs_no_lift(transit_itineraries, bus_itineraries):
    from datetime import datetime, timedelta, timezone
    from app.models import PlanRequest
    from app.services.refresh import evaluate
    from tests.test_conditions import NORMAL_DAY

    sgt = timezone(timedelta(hours=8))
    out = evaluate(
        req=PlanRequest(arrive_by=datetime(2026, 9, 21, 10, 0, tzinfo=sgt)),
        raw_itineraries=transit_itineraries + bus_itineraries,
        train_alerts_raw=NORMAL_DAY, alerts_data_source="simulated",
        origin=SAVED_PLACES["saved-home"], destination=SAVED_PLACES["ttsh-entrance"],
        journey_id="trip-001", current_version=1,
        now=datetime(2026, 9, 21, 8, 20, tzinfo=sgt),
        facilities_raw=NOVENA_LIFT_OUT,
    )

    assert out.result == "replacement_available"
    assert all(step.mode != "train" for step in out.journey.steps), "a bus needs no lift"
    assert any(a.type == "lift_maintenance" for a in out.journey.alerts)
    assert any("电梯" in reason.zh for reason in out.journey.reasons)


def test_a_crowded_platform_makes_refresh_offer_a_seat(transit_itineraries, bus_itineraries):
    from datetime import datetime, timedelta, timezone
    from app.models import PlanRequest
    from app.services.refresh import evaluate
    from tests.test_conditions import NORMAL_DAY

    sgt = timezone(timedelta(hours=8))
    out = evaluate(
        req=PlanRequest(arrive_by=datetime(2026, 9, 21, 10, 0, tzinfo=sgt)),
        raw_itineraries=transit_itineraries + bus_itineraries,
        train_alerts_raw=NORMAL_DAY, alerts_data_source="simulated",
        origin=SAVED_PLACES["saved-home"], destination=SAVED_PLACES["ttsh-entrance"],
        journey_id="trip-001", current_version=1,
        now=datetime(2026, 9, 21, 8, 20, tzinfo=sgt),
        crowd_raw={"NSL": CROWDED_NSL},
    )

    assert out.result == "replacement_available"
    assert all(step.mode != "train" for step in out.journey.steps)
    assert any(a.type == "crowding" for a in out.journey.alerts)
