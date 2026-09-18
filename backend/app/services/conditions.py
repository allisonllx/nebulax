"""Does a published condition touch this particular journey? Irrelevant ones are dropped, not shown."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.models import Alert, Text
from app.reference import LINES, canonical_line, station_name, station_number
from app.services.itinerary import CandidatePlan

SGT = timezone(timedelta(hours=8))
DataSource = Literal["live", "verified", "simulated"]


def _codes(csv: str | None) -> list[str]:
    """Station codes only. The field can also carry prose ('Free bus service island wide')."""
    out = []
    for chunk in (csv or "").split(","):
        code = chunk.strip().upper()
        if code and len(code) <= 5 and code[:2].isalpha() and any(ch.isdigit() for ch in code):
            out.append(code)
    return out


def _latest_message_time(raw: dict) -> datetime | None:
    stamps = []
    for message in raw.get("value", {}).get("Message", []) or []:
        try:
            stamps.append(datetime.strptime(message["CreatedDate"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=SGT))
        except (KeyError, ValueError):
            continue
    return max(stamps) if stamps else None


def _stretch(line: str, codes: list[str]) -> Text:
    ordered = sorted(codes, key=lambda c: station_number(c) or 0)
    first, last = station_name(ordered[0], ordered[0]), station_name(ordered[-1], ordered[-1])
    name = LINES[line].name
    return Text(en=f"No train service on the {name.en} between {first.en} and {last.en}.",
                zh=f"{name.zh}{first.zh}至{last.zh}之间列车服务中断。")


def train_alerts_for(plan: CandidatePlan, raw: dict, *, data_source: DataSource) -> list[Alert]:
    """LTA TrainServiceAlerts response -> alerts that intersect this plan's rail legs."""
    alerts: list[Alert] = []
    updated = _latest_message_time(raw)
    for n, segment in enumerate(raw.get("value", {}).get("AffectedSegments", []) or [], 1):
        line = canonical_line(segment.get("Line"))
        stations = _codes(segment.get("Stations"))
        if not line or not stations:
            continue
        leg_ids = plan.leg_ids_on(line, set(stations))
        if not leg_ids:
            continue
        free_bus = _codes(segment.get("FreePublicBus"))
        message = _stretch(line, stations)
        if free_bus or (segment.get("FreePublicBus") or "").strip():
            message = Text(en=message.en + " Free regular bus services are available.",
                           zh=message.zh + "可免费搭乘巴士。")
        alerts.append(Alert(
            id=f"train-{line}-{n}", type="train_disruption", severity="major", planned=False,
            message=message, line=line, station_codes=stations, free_public_bus_station_codes=free_bus,
            affects_journey=True, affected_leg_ids=leg_ids,
            source="LTA TrainServiceAlerts", data_source=data_source, source_updated_at=updated,
        ))
    return alerts
