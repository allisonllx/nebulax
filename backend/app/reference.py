"""Canonical line and station tables. Every provider's spelling is mapped through here."""
from dataclasses import dataclass

from app.models import Text


@dataclass(frozen=True)
class Line:
    code: str  # canonical, as used by LTA TrainServiceAlerts
    name: Text
    colour: Text
    low_terminal: Text | None = None   # end of the line with the lowest station number
    high_terminal: Text | None = None


LINES = {
    "NSL": Line("NSL", Text(en="North South Line", zh="南北线"), Text(en="red", zh="红色"),
                Text(en="Jurong East", zh="裕廊东"), Text(en="Marina South Pier", zh="滨海南码头")),
    "EWL": Line("EWL", Text(en="East West Line", zh="东西线"), Text(en="green", zh="绿色")),
    "NEL": Line("NEL", Text(en="North East Line", zh="东北线"), Text(en="purple", zh="紫色")),
    "CCL": Line("CCL", Text(en="Circle Line", zh="环线"), Text(en="orange", zh="橙色")),
    "DTL": Line("DTL", Text(en="Downtown Line", zh="滨海市区线"), Text(en="blue", zh="蓝色")),
    "TEL": Line("TEL", Text(en="Thomson-East Coast Line", zh="汤申-东海岸线"), Text(en="brown", zh="棕色")),
    "BPL": Line("BPL", Text(en="Bukit Panjang LRT", zh="武吉班让轻轨"), Text(en="grey", zh="灰色")),
    "STL": Line("STL", Text(en="Sengkang LRT", zh="盛港轻轨"), Text(en="grey", zh="灰色")),
    "PTL": Line("PTL", Text(en="Punggol LRT", zh="榜鹅轻轨"), Text(en="grey", zh="灰色")),
}

# Every spelling seen so far -> canonical. OneMap uses two-letter route codes; LTA's crowd and lift
# endpoints disagree with TrainServiceAlerts on the LRT lines and split out two extensions.
_LINE_ALIASES = {
    "NS": "NSL", "EW": "EWL", "NE": "NEL", "CC": "CCL", "DT": "DTL", "TE": "TEL",
    "CG": "EWL", "CGL": "EWL", "CE": "CCL", "CEL": "CCL",
    "BP": "BPL", "BPLRT": "BPL", "SLRT": "STL", "PLRT": "PTL",
}


def canonical_line(code: str | None) -> str | None:
    if not code:
        return None
    code = code.strip().upper()
    if code in LINES:
        return code
    return _LINE_ALIASES.get(code)


STATIONS = {
    "NS1": Text(en="Jurong East", zh="裕廊东"), "NS2": Text(en="Bukit Batok", zh="武吉巴督"),
    "NS3": Text(en="Bukit Gombak", zh="武吉甘柏"), "NS4": Text(en="Choa Chu Kang", zh="蔡厝港"),
    "NS5": Text(en="Yew Tee", zh="油池"), "NS7": Text(en="Kranji", zh="克兰芝"),
    "NS8": Text(en="Marsiling", zh="马西岭"), "NS9": Text(en="Woodlands", zh="兀兰"),
    "NS10": Text(en="Admiralty", zh="海军部"), "NS11": Text(en="Sembawang", zh="三巴旺"),
    "NS12": Text(en="Canberra", zh="坎贝拉"), "NS13": Text(en="Yishun", zh="义顺"),
    "NS14": Text(en="Khatib", zh="卡迪"), "NS15": Text(en="Yio Chu Kang", zh="杨厝港"),
    "NS16": Text(en="Ang Mo Kio", zh="宏茂桥"), "NS17": Text(en="Bishan", zh="碧山"),
    "NS18": Text(en="Braddell", zh="布莱德岭"), "NS19": Text(en="Toa Payoh", zh="大巴窑"),
    "NS20": Text(en="Novena", zh="诺维娜"), "NS21": Text(en="Newton", zh="纽顿"),
    "NS22": Text(en="Orchard", zh="乌节"), "NS23": Text(en="Somerset", zh="索美塞"),
    "NS24": Text(en="Dhoby Ghaut", zh="多美歌"), "NS25": Text(en="City Hall", zh="政府大厦"),
    "NS26": Text(en="Raffles Place", zh="莱佛士坊"), "NS27": Text(en="Marina Bay", zh="滨海湾"),
    "NS28": Text(en="Marina South Pier", zh="滨海南码头"),
}


def station_name(code: str | None, fallback: str) -> Text:
    """Official names where we have them; otherwise the provider's name in both languages."""
    if code and code.upper() in STATIONS:
        return STATIONS[code.upper()]
    tidy = fallback.title().replace("Mrt", "MRT").replace("Lrt", "LRT")
    return Text(en=tidy, zh=tidy)


def station_number(code: str) -> int | None:
    digits = "".join(ch for ch in code if ch.isdigit())
    return int(digits) if digits else None
