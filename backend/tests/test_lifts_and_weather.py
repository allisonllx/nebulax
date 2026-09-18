from app.config import SAVED_PLACES
from app.services import itinerary
from app.services.conditions import lift_alerts_for, weather_alerts_for

NO_LIFTS_DOWN = {"value": []}
NOVENA_LIFT_OUT = {"value": [
    {"Line": "NSL", "StationCode": "NS20", "StationName": "Novena",
     "LiftID": "B1L01", "LiftDesc": "Exit A Street level - Concourse"},
]}


def plan_of(raw):
    return itinerary.convert(raw, pace_factor=0.6, origin=SAVED_PLACES["saved-home"],
                             destination=SAVED_PLACES["ttsh-entrance"])


def test_no_maintenance_means_no_alerts(mrt_itinerary):
    assert lift_alerts_for(plan_of(mrt_itinerary), NO_LIFTS_DOWN, data_source="live") == []


def test_lift_down_at_his_alighting_station_is_flagged_with_the_exit(mrt_itinerary):
    alerts = lift_alerts_for(plan_of(mrt_itinerary), NOVENA_LIFT_OUT, data_source="live")

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.type == "lift_maintenance"
    assert alert.affects_journey is True
    assert alert.station_codes == ["NS20"]
    assert "Exit A" in alert.message.en and "Novena" in alert.message.en
    assert "A 出口" in alert.message.zh and "诺维娜" in alert.message.zh


def test_lift_down_at_a_station_he_passes_through_is_ignored(mrt_itinerary):
    passing = {"value": [{"Line": "NSL", "StationCode": "NS18", "StationName": "Braddell",
                          "LiftID": "L1", "LiftDesc": "Exit B Street level - Concourse"}]}

    assert lift_alerts_for(plan_of(mrt_itinerary), passing, data_source="live") == []


def test_lift_down_on_another_line_is_ignored(mrt_itinerary):
    elsewhere = {"value": [{"Line": "NEL", "StationCode": "NE14", "StationName": "Hougang",
                            "LiftID": "B1 L01", "LiftDesc": "Exit A Street level - Concourse"}]}

    assert lift_alerts_for(plan_of(mrt_itinerary), elsewhere, data_source="live") == []


def test_lift_desc_without_an_exit_still_produces_a_usable_message(mrt_itinerary):
    vague = {"value": [{"Line": "NSL", "StationCode": "NS16", "StationName": "Ang Mo Kio",
                        "LiftID": "", "LiftDesc": "Lift 1 (connecting concourse to Platform 1)"}]}

    alerts = lift_alerts_for(plan_of(mrt_itinerary), vague, data_source="live")

    assert len(alerts) == 1
    assert "lift" in alerts[0].message.en.lower()
    assert "电梯" in alerts[0].message.zh


RAIN = {"data": {
    "area_metadata": [
        {"name": "Ang Mo Kio", "label_location": {"latitude": 1.375, "longitude": 103.839}},
        {"name": "Novena", "label_location": {"latitude": 1.32, "longitude": 103.844}},
        {"name": "Jurong West", "label_location": {"latitude": 1.34, "longitude": 103.7}},
    ],
    "items": [{"forecasts": [
        {"area": "Ang Mo Kio", "forecast": "Moderate Rain"},
        {"area": "Novena", "forecast": "Partly Cloudy (Day)"},
        {"area": "Jurong West", "forecast": "Thundery Showers"},
    ]}],
}}

FAIR = {"data": {**RAIN["data"], "items": [{"forecasts": [
    {"area": "Ang Mo Kio", "forecast": "Partly Cloudy (Day)"},
    {"area": "Novena", "forecast": "Fair (Day)"},
    {"area": "Jurong West", "forecast": "Thundery Showers"},
]}]}}


def journey_ends():
    return SAVED_PLACES["saved-home"], SAVED_PLACES["ttsh-entrance"]


def test_rain_at_his_end_of_the_island_raises_a_walking_alert(mrt_itinerary):
    origin, dest = journey_ends()

    alerts = weather_alerts_for(plan_of(mrt_itinerary), RAIN, origin=origin, destination=dest,
                                data_source="live")

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.type == "weather"
    assert alert.affects_journey is True
    assert "Ang Mo Kio" in alert.message.en
    assert "雨" in alert.message.zh
    assert str(plan_of(mrt_itinerary).walk_distance_metres) in alert.message.en


def test_rain_far_away_does_not_bother_him(mrt_itinerary):
    origin, dest = journey_ends()

    assert weather_alerts_for(plan_of(mrt_itinerary), FAIR, origin=origin, destination=dest,
                              data_source="live") == []
