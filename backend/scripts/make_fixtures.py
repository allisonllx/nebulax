#!/usr/bin/env python3
"""Build docs/fixtures/*.json — example responses for the two-endpoint contract agreed on 19 Sep.

    POST /api/journeys/plan            -> plan.normal.json
    POST /api/journeys/{id}/refresh    -> refresh.unchanged.json
                                          refresh.replacement_available.json
                                          refresh.no_accessible_route.json

Route geometry, stops and base timings are real OneMap output for Ang Mo Kio Ave 3 -> Tan Tock Seng
Hospital. Timing at Mr Tan's pace, instructions and alerts are hand-written here and ILLUSTRATIVE:
they fix the response shape, not the final backend logic. Every alert and step says whether it is
live, verified or simulated.

Usage: python3 scripts/make_fixtures.py      (reads ONEMAP_TOKEN from backend/.env)
"""
import datetime as dt
import json
import pathlib
import urllib.parse
import urllib.request

BACKEND = pathlib.Path(__file__).resolve().parent.parent
OUT = BACKEND.parent / "docs" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob("*.json"):
    old.unlink()

ENV = dict(
    line.split("=", 1) for line in (BACKEND / ".env").read_text().splitlines()
    if "=" in line and not line.startswith("#")
)

SGT = dt.timezone(dt.timedelta(hours=8))
ARRIVE_BY = dt.datetime(2026, 9, 21, 10, 0, tzinfo=SGT)
ARRIVAL_BUFFER = dt.timedelta(minutes=30)
ORIGIN = {"lat": 1.3691, "lon": 103.8454, "en": "Home", "zh": "家"}
DEST = {"lat": 1.3214, "lon": 103.8459, "en": "Tan Tock Seng Hospital", "zh": "陈笃生医院"}
PACE_FACTOR = 0.6
ZH_STATIONS = {"NS16": "宏茂桥地铁站", "NS20": "诺维娜地铁站"}
NOTE = ("FIXTURE. Geometry and stops are real OneMap data. Timing, instructions and alerts are "
        "illustrative. Step-free status is unverified until someone walks the corridor.")


def onemap_route(mode):
    q = urllib.parse.urlencode({
        "start": f"{ORIGIN['lat']},{ORIGIN['lon']}", "end": f"{DEST['lat']},{DEST['lon']}",
        "routeType": "pt", "date": "09-21-2026", "time": "09:00:00", "mode": mode,
        "maxWalkDistance": 1000, "numItineraries": 3,
    })
    req = urllib.request.Request("https://www.onemap.gov.sg/api/public/routingsvc/route?" + q,
                                 headers={"Authorization": ENV["ONEMAP_TOKEN"].strip()})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["plan"]["itineraries"]


def decode_polyline(s):
    coords, i, lat, lon = [], 0, 0, 0
    while i < len(s):
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[i]) - 63
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


def place_names(p):
    if p["name"] == "Origin":
        return ORIGIN["en"], ORIGIN["zh"]
    if p["name"] == "Destination":
        return DEST["en"], DEST["zh"]
    en = p["name"].title().replace("Mrt", "MRT").replace("Stn", "Stn")
    return en, ZH_STATIONS.get(p.get("stopCode"), en)  # bus stop names stay as printed on the pole


def iso(t):
    return t.isoformat(timespec="seconds")


def build(it, trip_id, version, updated_at, role="recommended", affected_mrt=False):
    """One OneMap itinerary -> (steps, features, total_seconds)."""
    steps, features, total = [], [], it["waitingTime"]
    for n, leg in enumerate(it["legs"], 1):
        mode = {"WALK": "walk", "BUS": "bus", "SUBWAY": "mrt"}[leg["mode"]]
        seconds = leg["endTime"] // 1000 - leg["startTime"] // 1000
        if mode == "walk":
            seconds = round(seconds / PACE_FACTOR)
        total += seconds
        to_en, to_zh = place_names(leg["to"])
        mins = max(round(seconds / 60), 1)
        if mode == "walk":
            texts = [(f"Walk about {mins} minutes to {to_en}.", f"步行大约 {mins} 分钟,到{to_zh}。")]
        elif mode == "bus":
            texts = [(f"Take bus {leg['route']}.", f"搭 {leg['route']} 号巴士。"),
                     (f"Get off at {to_en}.", f"在 {to_zh} 下车。")]
        else:
            stops = len(leg.get("intermediateStops", [])) + 1
            code = leg["to"].get("stopCode")
            texts = [("Take the red North South Line towards Marina South Pier.",
                      "搭红色的南北线,往滨海南码头方向。"),
                     (f"Ride {stops} stops. Get off at {to_en} ({code}).", f"坐 {stops} 站,在{to_zh}({code})下车。")]
        leg_id = f"leg-{n}"
        step_ids = []
        for en, zh in texts:
            sid = f"step-{len(steps) + 1}"
            step_ids.append(sid)
            steps.append({
                "id": sid, "legId": leg_id, "mode": mode,
                "line": "NSL" if mode == "mrt" else None,
                "service": leg.get("route") if mode == "bus" else None,
                "instruction": {"en": en, "zh": zh},
                "durationSeconds": seconds if len(texts) == 1 or (en, zh) == texts[-1] else None,
                "distanceMetres": round(leg["distance"]) if mode == "walk" else None,
                "stepFree": "unverified",            # verified | unverified | blocked
                "connectivity": "tunnel" if mode == "mrt" else "online",
                "crowdLevel": None,                  # l | m | h | null = unknown
                "busLoad": None,                     # SEA | SDA | LSD | null = unknown
            })
        features.append({
            "type": "Feature",
            "properties": {"legId": leg_id, "role": role, "mode": mode,
                           "line": "NSL" if mode == "mrt" else None,
                           "service": leg.get("route") if mode == "bus" else None,
                           "status": "affected" if affected_mrt and mode == "mrt" else "normal",
                           "stepIds": step_ids},
            "geometry": {"type": "LineString", "coordinates": decode_polyline(leg["legGeometry"]["points"])},
        })
    return steps, features, total


def journey(it, version, updated_at, data_mode, summary, reasons, alerts, extra_features=()):
    steps, features, total = build(it, "trip-001", version, updated_at)
    latest_total = round(total * 1.2)
    depart = ARRIVE_BY - ARRIVAL_BUFFER - dt.timedelta(seconds=latest_total)
    depart = depart.replace(minute=depart.minute - depart.minute % 5, second=0)
    return {
        "_note": NOTE,
        "id": "trip-001", "version": version, "status": "ready",
        "dataMode": data_mode,                        # live | simulated  -> drives the on-screen label
        "updatedAt": iso(updated_at),
        "arriveBy": iso(ARRIVE_BY),
        "departureTime": iso(depart),
        "arrivalWindow": {"earliest": iso(depart + dt.timedelta(seconds=total)),
                          "latest": iso(depart + dt.timedelta(seconds=latest_total))},
        "walkDistanceMetres": round(it["walkDistance"]), "transfers": it["transfers"],
        "summary": summary, "reasons": reasons,
        "steps": steps,
        "routeGeometry": {"type": "FeatureCollection", "features": features + list(extra_features)},
        "alerts": alerts,
    }


mrt = next(i for i in onemap_route("TRANSIT") if any(l["mode"] == "SUBWAY" for l in i["legs"]))
bus = min(onemap_route("BUS"), key=lambda i: (i["transfers"], i["walkDistance"]))
t_plan = dt.datetime(2026, 9, 21, 8, 5, tzinfo=SGT)
t_refresh = dt.datetime(2026, 9, 21, 8, 20, tzinfo=SGT)

# 1. POST /api/journeys/plan — normal day, his usual route
normal = journey(
    mrt, 1, t_plan, "live",
    {"en": "Your usual route is clear today.", "zh": "今天照常走,路线一切正常。"},
    [{"en": "This is your usual route.", "zh": "这是你平时走的路线。"}],
    [])

# 2. refresh -> unchanged
unchanged = {"result": "unchanged", "checkedAt": iso(t_refresh), "journey": None}

# 3. refresh -> replacement_available (NSL disrupted, direct bus instead; previous route kept for comparison)
_, previous_features, _ = build(mrt, "trip-001", 1, t_plan, role="previous", affected_mrt=True)
nsl_alert = {
    "id": "alert-nsl-1", "type": "train_disruption", "severity": "major", "planned": False,
    "message": {"en": "No train service on the North South Line between Bishan and Newton. "
                      "Free regular bus services are available.",
                "zh": "南北线碧山至纽顿之间列车服务中断,可免费搭乘巴士。"},
    "line": "NSL", "stationCodes": ["NS17", "NS18", "NS19", "NS20", "NS21"],
    "affectsJourney": True, "affectedLegIds": ["leg-4"],
    "source": "LTA TrainServiceAlerts", "dataSource": "simulated",   # live | verified | simulated
    "sourceUpdatedAt": iso(t_refresh - dt.timedelta(minutes=3)),
}
replacement = journey(
    bus, 2, t_refresh, "simulated",
    {"en": "The MRT is disrupted. Take bus 851 instead.", "zh": "地铁中断,请改搭 851 号巴士。"},
    [{"en": "One bus all the way, no transfer.", "zh": "一趟巴士直达,不用换车。"},
     {"en": "About 11 minutes longer than your usual route.", "zh": "比平时的路线多大约 11 分钟。"}],
    [nsl_alert], extra_features=previous_features)
replacement_available = {"result": "replacement_available", "checkedAt": iso(t_refresh), "journey": replacement}

# 4. refresh -> no_accessible_route
no_route = {
    "result": "no_accessible_route", "checkedAt": iso(t_refresh), "journey": None,
    "message": {"en": "We cannot find a route without stairs right now. Please call Mei Ling.",
                "zh": "现在找不到不用走楼梯的路线。请打电话给美玲。"},
    "alerts": [nsl_alert, {
        "id": "alert-bus-851", "type": "bus_diversion", "severity": "major", "planned": False,
        "message": {"en": "Bus 851 is diverted and skips the Novena stop.", "zh": "851 号巴士改道,不停诺维娜站。"},
        "affectsJourney": True, "affectedLegIds": ["leg-2"],
        "source": "LTA TrainServiceAlerts Message", "dataSource": "simulated",
        "sourceUpdatedAt": iso(t_refresh - dt.timedelta(minutes=1)),
    }],
    "helpActions": [{"type": "call", "label": {"en": "Call Mei Ling", "zh": "打电话给美玲"}}],
}

for name, doc in (("plan.normal.json", normal), ("refresh.unchanged.json", unchanged),
                  ("refresh.replacement_available.json", replacement_available),
                  ("refresh.no_accessible_route.json", no_route)):
    (OUT / name).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    j = doc if "steps" in doc else doc.get("journey")
    print(f"{name}" + (f": v{j['version']} depart {j['departureTime'][11:16]} arrive "
                       f"{j['arrivalWindow']['earliest'][11:16]}-{j['arrivalWindow']['latest'][11:16]}, "
                       f"{len(j['steps'])} steps, {len(j['routeGeometry']['features'])} features" if j else f": {doc['result']}"))
    for s in (j["steps"] if j else []):
        print("    ", s["id"], s["instruction"]["zh"])
