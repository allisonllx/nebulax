"""Rank candidate routes for this traveller and time the journey backwards from the appointment."""
import uuid
from datetime import datetime, timedelta

from app.models import ArrivalWindow, Journey, Place, PlanRequest, Text
from app.services.itinerary import CandidatePlan, convert

ARRIVAL_BUFFER = timedelta(minutes=30)   # late = rescheduled, so arrive early by design
PESSIMISM = 1.2                          # latest = total * PESSIMISM; assumption noted in WRITEUP
TRANSFER_PENALTY_S = 300                 # five minutes of "cost" per transfer for this traveller
WALK_PENALTY_S_PER_100M = 60


def score(plan: CandidatePlan) -> float:
    return (plan.total_seconds
            + plan.transfers * TRANSFER_PENALTY_S
            + plan.walk_distance_metres / 100 * WALK_PENALTY_S_PER_100M)


def rank(candidates: list[CandidatePlan]) -> list[CandidatePlan]:
    return sorted(candidates, key=score)


def _round_down_5min(t: datetime) -> datetime:
    return t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)


def build_journey(req: PlanRequest, raw_itineraries: list[dict], *, origin: Place, destination: Place,
                  now: datetime, journey_id: str | None = None, version: int = 1,
                  data_mode: str = "live") -> Journey:
    candidates = [convert(raw, pace_factor=req.walking_speed_factor, origin=origin, destination=destination)
                  for raw in raw_itineraries]
    best = rank(candidates)[0]
    return assemble(req, best, now=now, journey_id=journey_id, version=version, data_mode=data_mode)


def assemble(req: PlanRequest, plan: CandidatePlan, *, now: datetime, journey_id: str | None = None,
             version: int = 1, data_mode: str = "live", summary: Text | None = None,
             reasons: list[Text] | None = None, extra_features: list[dict] | None = None) -> Journey:
    latest_seconds = round(plan.total_seconds * PESSIMISM)
    departure = _round_down_5min(req.arrive_by - ARRIVAL_BUFFER - timedelta(seconds=latest_seconds))
    if summary is None:
        hh, mm = departure.strftime("%H"), departure.strftime("%M")
        summary = Text(en=f"Your route is ready. Leave by {departure.strftime('%-I:%M %p').lower()}.",
                       zh=f"路线已准备好。最晚 {int(hh)} 点 {mm} 分出门。")
    if reasons is None:
        reasons = [_default_reason(plan)]
    return Journey(
        id=journey_id or f"trip-{uuid.uuid4().hex[:8]}",
        version=version, data_mode=data_mode, updated_at=now,
        arrive_by=req.arrive_by, departure_time=departure,
        arrival_window=ArrivalWindow(earliest=departure + timedelta(seconds=plan.total_seconds),
                                     latest=departure + timedelta(seconds=latest_seconds)),
        walk_distance_metres=plan.walk_distance_metres, transfers=plan.transfers,
        summary=summary, reasons=reasons, steps=plan.steps,
        route_geometry={"type": "FeatureCollection",
                        "features": plan.features + (extra_features or [])},
        alerts=[],
    )


def _default_reason(plan: CandidatePlan) -> Text:
    if plan.transfers == 0:
        return Text(en="No transfer on this route.", zh="这条路线不用换车。")
    return Text(en=f"Fastest route with {plan.transfers} transfer{'s' if plan.transfers > 1 else ''}.",
                zh=f"最快的路线,换乘 {plan.transfers} 次。")
