"""One action per sentence, written to be read aloud. Nothing here invents exits, lifts or landmarks."""
from app.models import Text
from app.reference import LINES, station_number


def walk(minutes: int, to: Text, to_is_station: bool) -> Text:
    suffix_en, suffix_zh = (" MRT station", "地铁站") if to_is_station else ("", "")
    return Text(en=f"Walk about {minutes} minutes to {to.en}{suffix_en}.",
                zh=f"步行大约 {minutes} 分钟,到{to.zh}{suffix_zh}。")


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
