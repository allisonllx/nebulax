from app.config import SAVED_PLACES
from app.services import itinerary
from app.services.conditions import train_alerts_for

NORMAL_DAY = {"value": {"Status": 1, "AffectedSegments": [], "Message": []}}


def disruption(line="NSL", stations="NS17,NS18,NS19,NS20,NS21", free_bus="NS17,NS18,NS19,NS20,NS21"):
    """Shape per the DataMall guide's field table and the envelope seen in live responses."""
    return {"value": {
        "Status": 2,
        "AffectedSegments": [{"Line": line, "Direction": "Both", "Stations": stations,
                              "FreePublicBus": free_bus, "FreeMRTShuttle": "", "MRTShuttleDirection": ""}],
        "Message": [{"Content": "No train service between Bishan and Newton.",
                     "CreatedDate": "2026-09-21 08:17:00"}],
    }}


def plan_of(raw):
    return itinerary.convert(raw, pace_factor=0.6, origin=SAVED_PLACES["saved-home"],
                             destination=SAVED_PLACES["ttsh-entrance"])


def test_normal_day_produces_no_alerts(mrt_itinerary):
    assert train_alerts_for(plan_of(mrt_itinerary), NORMAL_DAY, data_source="live") == []


def test_disruption_on_his_stations_names_the_affected_map_leg(mrt_itinerary):
    plan = plan_of(mrt_itinerary)

    alerts = train_alerts_for(plan, disruption(), data_source="simulated")

    assert len(alerts) == 1
    alert = alerts[0]
    mrt_leg_id = next(s.leg_id for s in plan.steps if s.mode == "mrt")
    assert alert.affects_journey is True
    assert alert.affected_leg_ids == [mrt_leg_id]
    assert alert.line == "NSL"
    assert alert.type == "train_disruption" and alert.severity == "major"
    assert alert.data_source == "simulated"


def test_disruption_elsewhere_on_his_line_is_not_his_problem(mrt_itinerary):
    far_north = disruption(stations="NS7,NS8,NS9", free_bus="NS7,NS8,NS9")

    assert train_alerts_for(plan_of(mrt_itinerary), far_north, data_source="live") == []


def test_disruption_on_another_line_is_ignored(mrt_itinerary):
    assert train_alerts_for(plan_of(mrt_itinerary), disruption(line="NEL", stations="NE1,NE3,NE4"),
                            data_source="live") == []


def test_bus_only_plan_is_untouched_by_a_rail_disruption(bus_itineraries):
    direct = min(bus_itineraries, key=lambda i: i["transfers"])

    assert train_alerts_for(plan_of(direct), disruption(), data_source="live") == []


def test_provider_line_spellings_are_normalised(mrt_itinerary):
    # OneMap calls the line "NS"; a feed that spelled it that way must still match.
    alerts = train_alerts_for(plan_of(mrt_itinerary), disruption(line="NS"), data_source="live")

    assert [a.line for a in alerts] == ["NSL"]


def test_free_bus_stations_are_parsed_so_the_app_can_point_him_to_them(mrt_itinerary):
    alerts = train_alerts_for(plan_of(mrt_itinerary), disruption(free_bus="NS17, NS18 ,NS19"), data_source="live")

    assert alerts[0].free_public_bus_station_codes == ["NS17", "NS18", "NS19"]


def test_alert_message_names_the_stretch_in_both_languages(mrt_itinerary):
    alert = train_alerts_for(plan_of(mrt_itinerary), disruption(), data_source="live")[0]

    assert "Bishan" in alert.message.en and "Newton" in alert.message.en
    assert "碧山" in alert.message.zh and "纽顿" in alert.message.zh


def test_island_wide_free_bus_is_not_mistaken_for_a_station_code(mrt_itinerary):
    alert = train_alerts_for(plan_of(mrt_itinerary), disruption(free_bus="Free bus service island wide"),
                             data_source="live")[0]

    assert alert.free_public_bus_station_codes == []
    assert "Free regular bus services are available" in alert.message.en
