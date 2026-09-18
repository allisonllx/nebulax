from datetime import datetime, timedelta, timezone

from app.config import SAVED_PLACES
from app.models import PlanRequest
from app.services.planner import build_journey

SGT = timezone(timedelta(hours=8))
ARRIVE_BY = datetime(2026, 9, 21, 10, 0, tzinfo=SGT)


def request(**overrides):
    return PlanRequest(arrive_by=ARRIVE_BY, **overrides)


def build(transit, bus, **overrides):
    return build_journey(request(**overrides), transit + bus,
                         origin=SAVED_PLACES["saved-home"], destination=SAVED_PLACES["ttsh-entrance"],
                         now=datetime(2026, 9, 21, 8, 5, tzinfo=SGT))


def test_recommends_the_fastest_candidate_on_a_normal_day(transit_itineraries, bus_itineraries):
    journey = build(transit_itineraries, bus_itineraries)

    assert any(s.mode == "mrt" for s in journey.steps)  # rail beats the direct bus on time


def test_departure_is_backwards_from_the_appointment_with_a_buffer(transit_itineraries, bus_itineraries):
    journey = build(transit_itineraries, bus_itineraries)

    slack = (journey.arrive_by - journey.arrival_window.latest).total_seconds() / 60
    assert slack >= 30  # ARRIVAL_BUFFER_MIN
    assert journey.departure_time.minute % 5 == 0
    assert journey.arrival_window.earliest < journey.arrival_window.latest


def test_arrival_window_is_a_range_not_a_promise(transit_itineraries, bus_itineraries):
    journey = build(transit_itineraries, bus_itineraries)

    walk_and_ride = (journey.arrival_window.earliest - journey.departure_time).total_seconds()
    padded = (journey.arrival_window.latest - journey.departure_time).total_seconds()
    assert padded >= walk_and_ride * 1.15  # pessimistic end is visibly wider


def test_journey_is_live_and_versioned(transit_itineraries, bus_itineraries):
    journey = build(transit_itineraries, bus_itineraries)

    assert journey.version == 1
    assert journey.data_mode == "live"
    assert journey.id


def test_a_reason_is_given_in_both_languages(transit_itineraries, bus_itineraries):
    journey = build(transit_itineraries, bus_itineraries)

    assert journey.reasons and journey.reasons[0].zh and journey.reasons[0].en


def test_route_geometry_covers_every_leg(transit_itineraries, bus_itineraries):
    journey = build(transit_itineraries, bus_itineraries)

    leg_ids = {f["properties"]["legId"] for f in journey.route_geometry["features"]}
    assert leg_ids == {s.leg_id for s in journey.steps}
    assert journey.route_geometry["type"] == "FeatureCollection"


def test_slower_walker_gets_an_earlier_departure(transit_itineraries, bus_itineraries):
    normal = build(transit_itineraries, bus_itineraries, walking_speed_factor=1.0)
    slow = build(transit_itineraries, bus_itineraries, walking_speed_factor=0.5)

    assert slow.departure_time < normal.departure_time
