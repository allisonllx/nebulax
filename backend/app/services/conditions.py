"""Does a published condition touch this particular journey? Irrelevant ones are dropped, not shown."""
import re
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


def lift_alerts_for(plan: CandidatePlan, raw: dict, *, data_source: DataSource) -> list[Alert]:
    """LTA FacilitiesMaintenance response -> lifts down at stations where he boards or alights.

    Stations he only rides through don't need a working lift, so they are ignored. The feed has no
    dates: this is the state right now, which is exactly how the message phrases it.
    """
    board_alight: set[str] = set()
    for _, stations in plan.rail_segments:
        if stations:
            board_alight.update({stations[0], stations[-1]})

    alerts: list[Alert] = []
    for n, row in enumerate(raw.get("value", []) or [], 1):
        code = (row.get("StationCode") or "").strip().upper()
        if code not in board_alight:
            continue
        station = station_name(code, row.get("StationName") or code)
        exit_match = re.search(r"EXIT\s+([A-Z0-9]+)", row.get("LiftDesc") or "", re.IGNORECASE)
        if exit_match:
            exit_id = exit_match.group(1).upper()
            message = Text(
                en=f"The lift at {station.en} ({code}) Exit {exit_id} is under maintenance right now. "
                   f"Use another exit with a lift.",
                zh=f"{station.zh}({code}){exit_id} 出口的电梯正在维修。请改用其他有电梯的出口。")
        else:
            message = Text(
                en=f"A lift at {station.en} ({code}) is under maintenance right now: "
                   f"{(row.get('LiftDesc') or '').strip()}.",
                zh=f"{station.zh}({code})有一部电梯正在维修。请留意站内指示。")
        alerts.append(Alert(
            id=f"lift-{code}-{n}", type="lift_maintenance", severity="minor", planned=False,
            message=message, line=canonical_line(row.get("Line")), station_codes=[code],
            affects_journey=True, affected_leg_ids=[],
            source="LTA FacilitiesMaintenance", data_source=data_source,
        ))
    return alerts


_RAIN_WORDS = ("rain", "showers", "thundery")


def _nearest_area_forecast(raw: dict, lat: float, lon: float) -> tuple[str, str] | None:
    data = raw.get("data") or {}
    areas = data.get("area_metadata") or []
    items = data.get("items") or []
    if not areas or not items:
        return None
    forecasts = {f.get("area"): f.get("forecast", "") for f in items[0].get("forecasts", [])}
    best = min(areas, key=lambda a: (a["label_location"]["latitude"] - lat) ** 2
                                     + (a["label_location"]["longitude"] - lon) ** 2)
    name = best.get("name", "")
    return (name, forecasts.get(name, "")) if name in forecasts else None


def weather_alerts_for(plan: CandidatePlan, raw: dict, *, origin, destination,
                       data_source: DataSource) -> list[Alert]:
    """data.gov.sg 2-hour nowcast -> one alert if rain is forecast at either end of his walk."""
    rainy: list[str] = []
    for place in (origin, destination):
        hit = _nearest_area_forecast(raw, place.lat, place.lon)
        if hit and any(word in hit[1].lower() for word in _RAIN_WORDS) and hit[0] not in rainy:
            rainy.append(hit[0])
    if not rainy:
        return []
    walk_m = plan.walk_distance_metres
    where_en, where_zh = " and ".join(rainy), "和".join(rainy)
    return [Alert(
        id="weather-rain", type="weather", severity="minor", planned=False,
        message=Text(en=f"Rain is expected around {where_en} in the next two hours. The walking "
                        f"parts of this route total about {walk_m} m — bring an umbrella.",
                     zh=f"未来两小时{where_zh}一带预计有雨。这条路线的步行部分共约 {walk_m} 米,请带伞。"),
        affects_journey=True, affected_leg_ids=[],
        source="data.gov.sg 2-hour weather nowcast", data_source=data_source,
    )]


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
