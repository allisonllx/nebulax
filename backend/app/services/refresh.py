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
             facilities_raw: dict | None = None, weather_raw: dict | None = None,
             crowd_raw: dict[str, dict | None] | None = None,
             chosen_index: int = 0) -> RefreshResponse:
    if train_alerts_raw is None:
        # A feed we could not read is unknown, never an all-clear.
        return RefreshResponse(result="unchanged", status="unchanged", checked_at=now, data_freshness="unknown")

    candidates = [convert(raw, pace_factor=req.walking_speed_factor, origin=origin, destination=destination)
                  for raw in raw_itineraries]
    ranked = planner.rank(candidates)
    current = ranked[min(chosen_index, len(ranked) - 1)]

    def blocking(candidate) -> list:
        """Conditions that make a plan unsuitable for HIM: the line is down, the lift he needs is
        out (no verified step-free exit), or the platform he must wait on is packed."""
        found = conditions.train_alerts_for(candidate, train_alerts_raw, data_source=alerts_data_source)
        if facilities_raw is not None:
            found += [a for a in conditions.lift_alerts_for(candidate, facilities_raw,
                                                            data_source=alerts_data_source)
                      if a.affected_leg_ids]
        if crowd_raw:
            found += [a for a in conditions.crowd_alerts_for(candidate, crowd_raw,
                                                             data_source=alerts_data_source)
                      if a.affected_leg_ids]
        return found

    current_alerts = blocking(current)
    if not current_alerts:
        return RefreshResponse(result="unchanged", status="unchanged", checked_at=now,
                               alerts=_side_alerts(current, facilities_raw, weather_raw,
                                                   origin, destination, alerts_data_source))

    data_mode = "simulated" if alerts_data_source == "simulated" else "live"
    feasible = [c for c in ranked if c is not current and not blocking(c)]
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
    kinds = {a.type for a in current_alerts}
    took_bus = all(step.mode != "train" for step in replacement.steps)
    if "train_disruption" in kinds:
        service = replacement.bus_services[0] if replacement.bus_services and took_bus else None
        summary = (Text(en=f"The MRT is disrupted. Take bus {service} instead.",
                        zh=f"地铁中断,请改搭 {service} 号巴士。") if service
                   else Text(en="The MRT is disrupted. Take the bus instead.", zh="地铁中断,请改搭巴士。"))
    elif "lift_maintenance" in kinds:
        summary = Text(en="A lift you need is out of service. Here is a route with no lift and no stairs.",
                       zh="您要用的电梯正在维修。这条路线不用电梯,也不用走楼梯。")
    else:
        summary = Text(en="The platform is very crowded. Here is a calmer route with a seat.",
                       zh="站台现在非常拥挤。这条路线更从容,而且有座位。")
    if "train_disruption" not in kinds:
        pass  # lift/crowd summaries above already name the reason; don't override with "MRT disrupted"
    if "train_disruption" in kinds:
        reasons = [Text(en="This route avoids the disrupted stretch.", zh="这条路线避开了中断的路段。")]
    elif "lift_maintenance" in kinds:
        reasons = [Text(en="With that lift out we cannot confirm a step-free way through the station, "
                           "so this route skips the station altogether.",
                        zh="那部电梯停用后,无法确认站内还有无台阶的通道,所以这条路线完全不经过该车站。")]
    else:
        reasons = [Text(en="It avoids the crowded platform, so there is no need to stand and wait.",
                        zh="避开了拥挤的站台,不用站着久等。")]
    if replacement.transfers == 0:
        reasons.append(Text(en="One ride, no transfer.", zh="一趟直达,不用换车。"))
    if all(step.mode != "train" for step in replacement.steps):
        reasons.append(Text(en="No stairs and no lift on the way.", zh="全程不用走楼梯,也不用等电梯。"))
    if extra_minutes:
        reasons.append(Text(en=f"About {extra_minutes} minutes longer than your usual route.",
                            zh=f"比平时的路线多大约 {extra_minutes} 分钟。"))

    journey = planner.assemble(req, replacement, now=now, journey_id=journey_id,
                               version=current_version + 1, data_mode=data_mode,
                               summary=summary, reasons=reasons, extra_features=previous_features,
                               origin=origin, destination=destination)
    journey.alerts = current_alerts + _side_alerts(replacement, facilities_raw, weather_raw,
                                                   origin, destination, alerts_data_source)
    return RefreshResponse(result="replacement_available", status="replacement_available", checked_at=now, journey=journey)
