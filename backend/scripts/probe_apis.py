#!/usr/bin/env python3
"""Call each API we plan to depend on once, save the raw response, print a summary.

Usage: python3 scripts/probe_apis.py      (reads keys from .env, no dependencies)
Raw responses land in probe-output/ (git-ignored).
"""
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "probe-output"
OUT.mkdir(exist_ok=True)

ENV = {}
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()

DATAMALL = "https://datamall2.mytransport.sg/ltaodataservice/"
ONEMAP = "https://www.onemap.gov.sg/api/"


def get(url, headers, name):
    req = urllib.request.Request(url, headers={**headers, "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        status = e.code
    (OUT / f"{name}.json").write_text(body)
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        return status, body[:300]


def datamall(endpoint, name, **params):
    url = DATAMALL + endpoint + ("?" + urllib.parse.urlencode(params) if params else "")
    return get(url, {"AccountKey": ENV["LTA_DATAMALL_ACCOUNT_KEY"]}, name)


def onemap(path, name, **params):
    url = ONEMAP + path + "?" + urllib.parse.urlencode(params)
    return get(url, {"Authorization": ENV["ONEMAP_TOKEN"]}, name)


def rows(data):
    return data.get("value", []) if isinstance(data, dict) else []


def section(title):
    print(f"\n=== {title} ===")


section("TrainServiceAlerts")
st, d = datamall("TrainServiceAlerts", "TrainServiceAlerts")
print("HTTP", st)
print(json.dumps(d, indent=2, ensure_ascii=False)[:1500])

section("v2/FacilitiesMaintenance (lifts under maintenance right now)")
st, d = datamall("v2/FacilitiesMaintenance", "FacilitiesMaintenance")
r = rows(d)
print("HTTP", st, "| rows:", len(r))
for x in r[:8]:
    print("  ", x)
if r:
    print("   keys:", sorted(r[0].keys()))

section("PCDRealTime NSL")
st, d = datamall("PCDRealTime", "PCDRealTime_NSL", TrainLine="NSL")
r = rows(d)
print("HTTP", st, "| rows:", len(r), "| levels:", Counter(x.get("CrowdLevel") for x in r))
print("   sample:", r[:2])

section("PCDForecast NSL — does it cover tomorrow?")
st, d = datamall("PCDForecast", "PCDForecast_NSL", TrainLine="NSL")
print("HTTP", st)
if isinstance(d, dict):
    v = d.get("value")
    print("   top-level keys:", list(d.keys()), "| value type:", type(v).__name__)
    text = json.dumps(d)
    print("   size:", len(text), "chars")
    print("   head:", text[:700])
else:
    print(d)

section("PlannedBusRoutes — populated ahead of EffectiveDate?")
st, d = datamall("PlannedBusRoutes", "PlannedBusRoutes")
r = rows(d)
print("HTTP", st, "| rows (first page):", len(r))
print("   EffectiveDate values:", Counter(x.get("EffectiveDate") for x in r).most_common(5))
print("   services:", sorted({x.get("ServiceNo") for x in r})[:20])

section("RoadWorks")
st, d = datamall("RoadWorks", "RoadWorks")
r = rows(d)
print("HTTP", st, "| rows (first page):", len(r))
print("   sample:", r[:1])

section("v3/BusArrival at Ang Mo Kio Int (54009)")
st, d = datamall("v3/BusArrival", "BusArrival_54009", BusStopCode="54009")
svcs = d.get("Services", []) if isinstance(d, dict) else []
print("HTTP", st, "| services:", len(svcs))
for s in svcs[:5]:
    nb = s.get("NextBus", {})
    print(f"   {s.get('ServiceNo'):>5}  eta={nb.get('EstimatedArrival')}  load={nb.get('Load')}  "
          f"feature={nb.get('Feature')}  type={nb.get('Type')}")

section("OneMap search: Tan Tock Seng Hospital")
st, d = onemap("common/elastic/search", "OneMap_search", searchVal="Tan Tock Seng Hospital",
               returnGeom="Y", getAddrDetails="Y", pageNum=1)
res = d.get("results", []) if isinstance(d, dict) else []
print("HTTP", st, "| results:", len(res))
for x in res[:3]:
    print("  ", x.get("SEARCHVAL"), x.get("LATITUDE"), x.get("LONGITUDE"))

section("OneMap public-transport route: Ang Mo Kio Ave 3 -> TTSH")
st, d = onemap("public/routingsvc/route", "OneMap_route_pt",
               start="1.3691,103.8454", end="1.3214,103.8459", routeType="pt",
               date="09-21-2026", time="09:00:00", mode="TRANSIT",
               maxWalkDistance=1000, numItineraries=3)
print("HTTP", st)
its = d.get("plan", {}).get("itineraries", []) if isinstance(d, dict) else []
if not its:
    print("  ", json.dumps(d)[:600])
for i, it in enumerate(its):
    legs = " > ".join(f"{l['mode']}{'(' + l.get('route', '') + ')' if l.get('route') else ''}" for l in it["legs"])
    print(f"   #{i + 1}: {it['duration'] // 60} min, walk {int(it['walkDistance'])} m, "
          f"transfers {it['transfers']} | {legs}")
