"""One action per sentence, written to be read aloud. Nothing here invents exits, lifts or landmarks."""
from app.models import Text
from app.reference import LINES, station_number


def walk(minutes: int, to: Text, to_is_station: bool) -> Text:
    already_named = "station" in to.en.lower() or "地铁站" in to.zh
    suffix_en, suffix_zh = (" MRT station", "地铁站") if to_is_station and not already_named else ("", "")
    return Text(en=f"Walk about {minutes} minutes to {to.en}{suffix_en}.",
                zh=f"步行大约 {minutes} 分钟,到{to.zh}{suffix_zh}。")


_COMPASS = {
    "NORTH": Text(en="north", zh="北面"), "NORTHEAST": Text(en="north-east", zh="东北面"),
    "EAST": Text(en="east", zh="东面"), "SOUTHEAST": Text(en="south-east", zh="东南面"),
    "SOUTH": Text(en="south", zh="南面"), "SOUTHWEST": Text(en="south-west", zh="西南面"),
    "WEST": Text(en="west", zh="西面"), "NORTHWEST": Text(en="north-west", zh="西北面"),
}
_TURNS = {
    "LEFT": Text(en="Turn left", zh="左转"), "RIGHT": Text(en="Turn right", zh="右转"),
    "SLIGHTLY_LEFT": Text(en="Bear left", zh="稍向左"), "SLIGHTLY_RIGHT": Text(en="Bear right", zh="稍向右"),
    "HARD_LEFT": Text(en="Turn sharply left", zh="向左急转"), "HARD_RIGHT": Text(en="Turn sharply right", zh="向右急转"),
    "CONTINUE": Text(en="Continue straight", zh="直走"),
    "UTURN_LEFT": Text(en="Turn around", zh="掉头"), "UTURN_RIGHT": Text(en="Turn around", zh="掉头"),
}


def _street(name: str) -> Text:
    if not name or name.lower() in ("path", "footpath", "sidewalk", "road", "steps"):
        return Text(en="the walking path", zh="步行道")
    return Text(en=name.title(), zh=name.title())


def bearing_to_compass(start: list[float], end: list[float]) -> Text | None:
    """Initial compass direction from one [lon, lat] to another, for the geometry fallback."""
    import math
    d_lon, d_lat = end[0] - start[0], end[1] - start[1]
    if abs(d_lon) < 1e-6 and abs(d_lat) < 1e-6:
        return None
    angle = (math.degrees(math.atan2(d_lon, d_lat)) + 360) % 360
    names = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"]
    return _COMPASS[names[round(angle / 45) % 8]]


def walk_fallback_direction(coords: list[list[float]], metres: int) -> list[Text]:
    """When the provider gives no street-level steps, derive one honest sentence from geometry."""
    if len(coords) < 2:
        return []
    compass = bearing_to_compass(coords[0], coords[min(len(coords) - 1, 3)])
    if compass is None:
        return []
    return [Text(en=f"Set off towards the {compass.en} and follow the path for about {metres} m.",
                 zh=f"朝{compass.zh}出发,沿步行道走大约 {metres} 米。")]


def walk_directions(raw_steps: list[dict]) -> list[Text]:
    """OneMap's street-level walking steps -> spoken-ready sentences. Compass words pair with the
    north-up map; we never invent landmarks the data does not contain."""
    out: list[Text] = []
    for raw in raw_steps:
        metres = max(round(float(raw.get("distance", 0))), 1)
        street = _street(raw.get("streetName") or "")
        relative = (raw.get("relativeDirection") or "").upper()
        if relative == "DEPART" or not out and relative not in _TURNS:
            compass = _COMPASS.get((raw.get("absoluteDirection") or "").upper())
            if compass:
                out.append(Text(
                    en=f"Set off towards the {compass.en}, along {street.en} for about {metres} m.",
                    zh=f"朝{compass.zh}出发,沿{street.zh}走大约 {metres} 米。"))
            else:
                out.append(Text(en=f"Walk along {street.en} for about {metres} m.",
                                zh=f"沿{street.zh}走大约 {metres} 米。"))
        else:
            turn = _TURNS.get(relative, Text(en="Continue", zh="继续走"))
            out.append(Text(en=f"{turn.en}, then follow {street.en} for about {metres} m.",
                            zh=f"{turn.zh},沿{street.zh}走大约 {metres} 米。"))
    return out


def board_bus(service: str) -> Text:
    return Text(en=f"Take bus {service}.", zh=f"搭 {service} 号巴士。")


def alight_bus(stop: Text) -> Text:
    # Bus stop names stay as printed on the pole, so the Chinese sentence keeps the English name.
    return Text(en=f"Get off at {stop.en}.", zh=f"在 {stop.zh} 下车。")


def board_train(line_code: str, from_code: str, to_code: str) -> Text:
    line = LINES[line_code]
    start, end = station_number(from_code), station_number(to_code)
    terminal = None
    if start is not None and end is not None and start != end:
        terminal = line.high_terminal if end > start else line.low_terminal
    if terminal:
        return Text(en=f"Take the {line.colour.en} {line.name.en} towards {terminal.en}.",
                    zh=f"搭{line.colour.zh}的{line.name.zh},往{terminal.zh}方向。")
    return Text(en=f"Take the {line.colour.en} {line.name.en}.", zh=f"搭{line.colour.zh}的{line.name.zh}。")


def alight_train(stops: int, station: Text, code: str) -> Text:
    return Text(en=f"Ride {stops} stops. Get off at {station.en} ({code}).",
                zh=f"坐 {stops} 站,在{station.zh}({code})下车。")
