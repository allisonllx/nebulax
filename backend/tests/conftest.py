import json
import pathlib

import pytest

DATA = pathlib.Path(__file__).parent / "data"


def load(name):
    return json.loads((DATA / name).read_text())


@pytest.fixture
def transit_itineraries():
    """Real OneMap response, Ang Mo Kio Ave 3 -> TTSH, mode=TRANSIT."""
    return load("onemap_transit.json")["plan"]["itineraries"]


@pytest.fixture
def bus_itineraries():
    """Real OneMap response, same trip, mode=BUS. Contains the direct bus 851."""
    return load("onemap_bus.json")["plan"]["itineraries"]


@pytest.fixture
def mrt_itinerary(transit_itineraries):
    return next(i for i in transit_itineraries if any(l["mode"] == "SUBWAY" for l in i["legs"]))
