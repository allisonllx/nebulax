"""Labelled demo scenarios. Activating one overrides what the clients return — nothing else changes,
so the replayed path exercises the same planning code as live data."""
from dataclasses import dataclass, field

from app.models import Text

# Shaped after the DataMall guide's Annex C contingency example, transplanted to the NSL stretch
# Mr Tan rides. Always served with data_source="simulated".
NSL_DISRUPTION = {"value": {
    "Status": 2,
    "AffectedSegments": [{
        "Line": "NSL", "Direction": "Both",
        "Stations": "NS16,NS17,NS18,NS19,NS20,NS21",
        "FreePublicBus": "NS16,NS17,NS18,NS19,NS20,NS21",
        "FreeMRTShuttle": "", "MRTShuttleDirection": "",
    }],
    "Message": [{"Content": "NSL: No train service between Ang Mo Kio and Newton due to a signalling "
                            "fault. Free regular bus services are available at designated stops.",
                 "CreatedDate": "2026-09-21 08:17:00"}],
}}

# Field-for-field the shape FacilitiesMaintenance really returns (probed 18 Sep 2026).
NOVENA_LIFT_OUT = {"value": [{
    "Line": "NSL", "StationCode": "NS20", "StationName": "Novena",
    "LiftID": "B1L01", "LiftDesc": "Exit A Street level - Concourse",
}]}

# Same envelope as the data.gov.sg 2-hour nowcast, reduced to the areas the demo journey touches.
HEAVY_RAIN = {"data": {
    "area_metadata": [
        {"name": "Ang Mo Kio", "label_location": {"latitude": 1.375, "longitude": 103.839}},
        {"name": "Novena", "label_location": {"latitude": 1.32, "longitude": 103.844}},
    ],
    "items": [{"forecasts": [
        {"area": "Ang Mo Kio", "forecast": "Heavy Thundery Showers"},
        {"area": "Novena", "forecast": "Moderate Rain"},
    ]}],
}}


CROWDED_NSL = {"value": [
    {"Station": "NS16", "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "h"},
    {"Station": "NS17", "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "h"},
    {"Station": "NS20", "StartTime": "2026-09-21T08:30:00+08:00", "CrowdLevel": "m"},
]}


@dataclass
class Scenario:
    name: str
    title: Text
    # None = that feed stays live; a dict replaces the client's response.
    train_alerts: dict | None = None
    facilities: dict | None = None
    weather: dict | None = None
    crowd: dict | None = None


SCENARIO_DEFS = {
    "nsl_disruption": Scenario(
        name="nsl_disruption",
        title=Text(en="NSL disrupted Ang Mo Kio–Newton (simulated)", zh="南北线宏茂桥至纽顿中断(模拟)"),
        train_alerts=NSL_DISRUPTION,
    ),
    "novena_lift_out": Scenario(
        name="novena_lift_out",
        title=Text(en="Novena Exit A lift under maintenance (simulated)", zh="诺维娜 A 出口电梯维修(模拟)"),
        facilities=NOVENA_LIFT_OUT,
    ),
    "heavy_rain": Scenario(
        name="heavy_rain",
        title=Text(en="Heavy rain over the route (simulated)", zh="路线沿途大雨(模拟)"),
        weather=HEAVY_RAIN,
    ),
    "crowded_platform": Scenario(
        name="crowded_platform",
        title=Text(en="Ang Mo Kio platform very crowded (simulated)", zh="宏茂桥站台非常拥挤(模拟)"),
        crowd={"NSL": CROWDED_NSL},
    ),
    # The scenario that is specific to this traveller: a broken lift and a packed platform are
    # inconveniences for most commuters, but they are showstoppers for him.
    "hard_for_him": Scenario(
        name="hard_for_him",
        title=Text(en="Lift out of service + crowded platform (simulated)",
                   zh="电梯维修 + 站台拥挤(模拟)"),
        facilities=NOVENA_LIFT_OUT, crowd={"NSL": CROWDED_NSL},
    ),
    "bad_day": Scenario(  # everything at once — the "worst morning" demo
        name="bad_day",
        title=Text(en="Disruption + lift outage + rain (simulated)", zh="故障+电梯维修+大雨(模拟)"),
        train_alerts=NSL_DISRUPTION, facilities=NOVENA_LIFT_OUT, weather=HEAVY_RAIN,
        crowd={"NSL": CROWDED_NSL},
    ),
}


class ScenarioState:
    def __init__(self):
        self.active: str | None = None

    def activate(self, name: str) -> Scenario:
        scenario = SCENARIO_DEFS[name]
        self.active = name
        return scenario

    def deactivate(self):
        self.active = None

    @property
    def scenario(self) -> Scenario | None:
        return SCENARIO_DEFS.get(self.active) if self.active else None
