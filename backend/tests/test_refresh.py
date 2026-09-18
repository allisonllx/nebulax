from datetime import datetime, timedelta, timezone

from app.config import SAVED_PLACES
from app.models import PlanRequest
from app.services.refresh import evaluate
from tests.test_conditions import NORMAL_DAY, disruption

SGT = timezone(timedelta(hours=8))
ARRIVE_BY = datetime(2026, 9, 21, 10, 0, tzinfo=SGT)
NOW = datetime(2026, 9, 21, 8, 20, tzinfo=SGT)


def evaluate_with(transit, bus, alerts_raw, *, alerts_source="live"):
    return evaluate(
        req=PlanRequest(arrive_by=ARRIVE_BY),
        raw_itineraries=transit + bus,
        train_alerts_raw=alerts_raw,
        alerts_data_source=alerts_source,
        origin=SAVED_PLACES["saved-home"], destination=SAVED_PLACES["ttsh-entrance"],
        journey_id="trip-001", current_version=1, now=NOW,
    )


def test_quiet_feed_means_unchanged(transit_itineraries, bus_itineraries):
    out = evaluate_with(transit_itineraries, bus_itineraries, NORMAL_DAY)

    assert out.result == "unchanged"
    assert out.journey is None
    assert out.checked_at == NOW


def test_disruption_proposes_the_direct_bus_as_version_2(transit_itineraries, bus_itineraries):
    out = evaluate_with(transit_itineraries, bus_itineraries, disruption(), alerts_source="simulated")

    assert out.result == "replacement_available"
    journey = out.journey
    assert journey.version == 2
    assert journey.id == "trip-001"
    assert all(s.mode != "mrt" for s in journey.steps)          # replacement avoids the broken line
    assert journey.data_mode == "simulated"                      # simulated alert -> labelled journey
    assert any(a.type == "train_disruption" for a in journey.alerts)


def test_replacement_keeps_the_previous_route_for_comparison(transit_itineraries, bus_itineraries):
    out = evaluate_with(transit_itineraries, bus_itineraries, disruption(), alerts_source="simulated")

    roles = {f["properties"]["role"] for f in out.journey.route_geometry["features"]}
    assert roles == {"recommended", "previous"}
    previous = [f for f in out.journey.route_geometry["features"] if f["properties"]["role"] == "previous"]
    assert any(f["properties"]["status"] == "affected" for f in previous)


def test_replacement_explains_the_change_in_both_languages(transit_itineraries, bus_itineraries):
    journey = evaluate_with(transit_itineraries, bus_itineraries, disruption(), alerts_source="simulated").journey

    assert "巴士" in journey.summary.zh
    assert "bus" in journey.summary.en.lower()
    assert journey.reasons


def test_no_feasible_candidate_is_said_plainly_with_help(transit_itineraries):
    # Only rail candidates available, and rail is disrupted: nothing usable remains.
    out = evaluate_with(transit_itineraries, [], disruption(), alerts_source="simulated")

    assert out.result == "no_accessible_route"
    assert out.journey is None
    assert out.message.zh and out.message.en
    assert out.alerts and out.help_actions
    assert out.help_actions[0].type == "call"


def test_a_failed_feed_is_unknown_not_all_clear(transit_itineraries, bus_itineraries):
    out = evaluate_with(transit_itineraries, bus_itineraries, None)

    assert out.result == "unchanged"
    assert out.data_freshness == "unknown"


def test_replacement_warnings_describe_the_replacement_not_the_old_route(transit_itineraries, bus_itineraries):
    novena_lift = {"value": [{"Line": "NSL", "StationCode": "NS20", "StationName": "Novena",
                              "LiftID": "B1L01", "LiftDesc": "Exit A Street level - Concourse"}]}
    out = evaluate(
        req=PlanRequest(arrive_by=ARRIVE_BY),
        raw_itineraries=transit_itineraries + bus_itineraries,
        train_alerts_raw=disruption(), alerts_data_source="simulated",
        origin=SAVED_PLACES["saved-home"], destination=SAVED_PLACES["ttsh-entrance"],
        journey_id="trip-001", current_version=1, now=NOW,
        facilities_raw=novena_lift,
    )

    # The recommended bus route never enters Novena MRT station, so no lift warning belongs on it.
    assert out.result == "replacement_available"
    assert all(a.type != "lift_maintenance" for a in out.journey.alerts)
