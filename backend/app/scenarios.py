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


@dataclass
class Scenario:
    name: str
    title: Text
    train_alerts: dict = field(repr=False)


SCENARIO_DEFS = {
    "nsl_disruption": Scenario(
        name="nsl_disruption",
        title=Text(en="NSL disrupted Ang Mo Kio–Newton (simulated)", zh="南北线宏茂桥至纽顿中断(模拟)"),
        train_alerts=NSL_DISRUPTION,
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
