"""Turn one raw OneMap itinerary into our steps and map geometry, timed at the traveller's pace."""
from dataclasses import dataclass, field
from typing import Any

from app.models import Place, Step, Text
from app.reference import canonical_line, station_name
from app.services import instructions

_MODES = {"WALK": "walk", "BUS": "bus", "SUBWAY": "train", "TRAM": "train", "RAIL": "train"}


@dataclass
class CandidatePlan:
    steps: list[Step]
    features: list[dict[str, Any]]
    total_seconds: int
    walk_distance_metres: int
    transfers: int
    rail_segments: list[tuple[str, list[str]]] = field(default_factory=list)  # (line, every station passed)
    bus_services: list[str] = field(default_factory=list)

    def leg_ids_on(self, line: str, station_codes: set[str]) -> list[str]:
        """Map legs of this plan that run on `line` through any of `station_codes`."""
        hit = []
        for feature in self.features:
            props = feature["properties"]
            if props["line"] == line and station_codes & set(props["stationCodes"]):
                hit.append(props["legId"])
        return hit


def decode_polyline(encoded: str) -> list[list[float]]:
    """Google-encoded polyline (precision 5) -> GeoJSON positions, longitude first."""
    coords, i, lat, lon = [], 0, 0, 0
    while i < len(encoded):
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(encoded[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += delta
            else:
                lon += delta
        coords.append([round(lon / 1e5, 5), round(lat / 1e5, 5)])
    return coords


def _place_name(raw: dict, origin: Place, destination: Place) -> tuple[Text, bool]:
    """(name, is_station). OneMap labels the ends of the trip 'Origin' and 'Destination'."""
    if raw["name"] == "Origin":
        return origin.name, False
    if raw["name"] == "Destination":
        return destination.name, False
    code = raw.get("stopCode") or ""
    is_station = raw.get("vertexType") == "TRANSIT" and not code.isdigit()
    return station_name(code if is_station else None, raw["name"]), is_station


def convert(raw: dict, *, pace_factor: float, origin: Place, destination: Place) -> CandidatePlan:
    steps: list[Step] = []
    features: list[dict[str, Any]] = []
    rail_segments: list[tuple[str, list[str]]] = []
    bus_services: list[str] = []
    total = int(raw.get("waitingTime", 0))

    for n, leg in enumerate(raw["legs"], 1):
        mode = _MODES.get(leg["mode"], "walk")
        seconds = leg["endTime"] // 1000 - leg["startTime"] // 1000
        if mode == "walk":
            seconds = round(seconds / pace_factor)
        total += seconds
        leg_id = f"leg-{n}"
        to_name, to_is_station = _place_name(leg["to"], origin, destination)
        from_name, _ = _place_name(leg["from"], origin, destination)
        line = canonical_line(leg.get("route")) if mode == "train" else None
        service = leg.get("route") if mode == "bus" else None
        station_codes: list[str] = []

        walk_directions: list[Text] = []
        if mode == "walk":
            texts = [instructions.walk(max(round(seconds / 60), 1), to_name, to_is_station)]
            walk_directions = instructions.walk_directions(leg.get("steps") or [])
        elif mode == "bus":
            bus_services.append(service)
            texts = [instructions.board_bus(service), instructions.alight_bus(to_name)]
        else:
            from_code, to_code = leg["from"].get("stopCode", ""), leg["to"].get("stopCode", "")
            passed = [s.get("stopCode", "") for s in leg.get("intermediateStops", [])]
            station_codes = [from_code, *passed, to_code]
            if line:
                rail_segments.append((line, station_codes))
            texts = [instructions.board_train(line, from_code, to_code) if line
                     else Text(en="Take the train.", zh="搭地铁。"),
                     instructions.alight_train(len(passed) + 1, to_name, to_code)]

        minutes = max(round(seconds / 60), 1)
        step_ids = []
        for i, text in enumerate(texts):
            step_id = f"step-{len(steps) + 1}"
            step_ids.append(step_id)
            is_last = i == len(texts) - 1
            is_board = mode != "walk" and i == 0
            place = from_name if is_board else to_name
            # The UI shows this as the confirm button he taps, so it is phrased as his own words.
            if mode == "walk":
                confirmation = Text(en=f"I have reached {to_name.en}", zh=f"我到了{to_name.zh}")
            elif is_board:
                confirmation = Text(en="I am on board", zh="我已上车")
            else:
                confirmation = Text(en=f"I have alighted at {to_name.en}", zh=f"我在{to_name.zh}下车了")
            steps.append(Step(
                id=step_id, leg_id=leg_id, mode=mode, line=line, service=service, instruction=text,
                directions=walk_directions,
                detail=Text(en=f"{from_name.en} → {to_name.en}", zh=f"{from_name.zh} → {to_name.zh}"),
                confirmation=confirmation, place=place,
                # Riding time sits on the boarding step; stepping off takes no extra minutes.
                duration_minutes=minutes if (mode == "walk" or is_board) else 0,
                duration_seconds=seconds if is_last else None,  # the leg's time sits on its final step
                distance_metres=round(leg["distance"]) if mode == "walk" else None,
                connectivity="tunnel" if mode == "train" else "online",
            ))
        features.append({
            "type": "Feature",
            "properties": {"legId": leg_id, "role": "recommended", "mode": mode, "line": line,
                           "service": service, "status": "normal", "affected": False,
                           "stepIds": step_ids, "stationCodes": station_codes},
            "geometry": {"type": "LineString", "coordinates": decode_polyline(leg["legGeometry"]["points"])},
        })

    return CandidatePlan(steps=steps, features=features, total_seconds=total,
                         walk_distance_metres=round(raw.get("walkDistance", 0)),
                         transfers=int(raw.get("transfers", 0)),
                         rail_segments=rail_segments, bus_services=bus_services)
