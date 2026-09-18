"""Re-evaluate a journey against current conditions: unchanged, replacement, or nothing usable."""
from datetime import datetime

from app.models import HelpAction, Place, PlanRequest, RefreshResponse, Text
from app.services import conditions, planner
from app.services.itinerary import convert


def _side_alerts(plan, facilities_raw, weather_raw, origin, destination, source):
    """Lift and rain warnings for the plan actually being recommended. They inform, never invalidate."""
    alerts = []
    if facilities_raw is not None:
        alerts += conditions.lift_alerts_for(plan, facilities_raw, data_source=source)
    if weather_raw is not None:
        alerts += conditions.weather_alerts_for(plan, weather_raw, origin=origin,
                                                destination=destination, data_source=source)
    return alerts


def evaluate(*, req: PlanRequest, raw_itineraries: list[dict], train_alerts_raw: dict | None,
             alerts_data_source: str, origin: Place, destination: Place,
             journey_id: str, current_version: int, now: datetime,
             facilities_raw: dict | None = None, weather_raw: dict | None = None) -> RefreshResponse:
    if train_alerts_raw is None:
        # A feed we could not read is unknown, never an all-clear.
        return RefreshResponse(result="unchanged", status="unchanged", checked_at=now, data_freshness="unknown")

    candidates = [convert(raw, pace_factor=req.walking_speed_factor, origin=origin, destination=destination)
                  for raw in raw_itineraries]
    ranked = planner.rank(candidates)
    current = ranked[0]

    current_alerts = conditions.train_alerts_for(current, train_alerts_raw, data_source=alerts_data_source)
    if not current_alerts:
        return RefreshResponse(result="unchanged", status="unchanged", checked_at=now,
                               alerts=_side_alerts(current, facilities_raw, weather_raw,
                                                   origin, destination, alerts_data_source))

    data_mode = "simulated" if alerts_data_source == "simulated" else "live"
    feasible = [c for c in ranked[1:]
                if not conditions.train_alerts_for(c, train_alerts_raw, data_source=alerts_data_source)]
    if not feasible:
        return RefreshResponse(
            result="no_accessible_route", status="no_accessible_route", checked_at=now,
            message=Text(en="We cannot find a usable route right now. Please call for help.",
                         zh="现在找不到可用的路线。请打电话求助。"),
            alerts=current_alerts,
            help_actions=[HelpAction(type="call", label=Text(en="Call for help", zh="打电话求助"))],
        )

    replacement = feasible[0]
    previous_features = []
    affected_leg_ids = {leg_id for a in current_alerts for leg_id in a.affected_leg_ids}
    for feature in current.features:
        props = {**feature["properties"], "role": "previous"}
        if props["legId"] in affected_leg_ids:
            props["status"] = "affected"
            props["affected"] = True
        previous_features.append({**feature, "properties": props})

    extra_minutes = max(round((replacement.total_seconds - current.total_seconds) / 60), 0)
    summary = Text(en="The MRT is disrupted. Take the bus instead.", zh="地铁中断,请改搭巴士。")
    if replacement.bus_services and not any(s.mode == "train" for s in replacement.steps):
        service = replacement.bus_services[0]
        summary = Text(en=f"The MRT is disrupted. Take bus {service} instead.",
                       zh=f"地铁中断,请改搭 {service} 号巴士。")
    reasons = [Text(en="This route avoids the disrupted stretch.", zh="这条路线避开了中断的路段。")]
    if replacement.transfers == 0:
        reasons.append(Text(en="One ride, no transfer.", zh="一趟直达,不用换车。"))
    if extra_minutes:
        reasons.append(Text(en=f"About {extra_minutes} minutes longer than your usual route.",
                            zh=f"比平时的路线多大约 {extra_minutes} 分钟。"))

    journey = planner.assemble(req, replacement, now=now, journey_id=journey_id,
                               version=current_version + 1, data_mode=data_mode,
                               summary=summary, reasons=reasons, extra_features=previous_features)
    journey.alerts = current_alerts + _side_alerts(replacement, facilities_raw, weather_raw,
                                                   origin, destination, alerts_data_source)
    return RefreshResponse(result="replacement_available", status="replacement_available", checked_at=now, journey=journey)
