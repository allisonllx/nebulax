from app.config import SAVED_PLACES
from app.services import itinerary


def convert(raw, pace_factor):
    return itinerary.convert(raw, pace_factor=pace_factor,
                             origin=SAVED_PLACES["saved-home"], destination=SAVED_PLACES["ttsh-entrance"])


def test_walking_legs_are_retimed_at_the_travellers_pace(mrt_itinerary):
    first_leg = mrt_itinerary["legs"][0]
    onemap_seconds = first_leg["endTime"] // 1000 - first_leg["startTime"] // 1000

    plan = convert(mrt_itinerary, pace_factor=0.6)

    assert plan.steps[0].mode == "walk"
    assert plan.steps[0].duration_seconds == round(onemap_seconds / 0.6)


def test_transit_legs_keep_onemap_timing(mrt_itinerary):
    mrt_leg = next(l for l in mrt_itinerary["legs"] if l["mode"] == "SUBWAY")
    onemap_seconds = mrt_leg["endTime"] // 1000 - mrt_leg["startTime"] // 1000

    plan = convert(mrt_itinerary, pace_factor=0.6)

    alight = [s for s in plan.steps if s.mode == "train"][-1]
    assert alight.duration_seconds == onemap_seconds


def test_total_includes_waiting_time_and_slower_walking(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    assert plan.total_seconds == sum(s.duration_seconds or 0 for s in plan.steps) + mrt_itinerary["waitingTime"]
    assert plan.total_seconds > mrt_itinerary["duration"]


def test_boarding_and_alighting_are_separate_steps_on_one_map_leg(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    mrt_steps = [s for s in plan.steps if s.mode == "train"]
    assert len(mrt_steps) == 2
    assert mrt_steps[0].leg_id == mrt_steps[1].leg_id
    feature = next(f for f in plan.features if f["properties"]["legId"] == mrt_steps[0].leg_id)
    assert feature["properties"]["stepIds"] == [s.id for s in mrt_steps]


def test_step_ids_are_sequential_and_unique(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    assert [s.id for s in plan.steps] == [f"step-{n}" for n in range(1, len(plan.steps) + 1)]


def test_geometry_is_geojson_longitude_first(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    for feature in plan.features:
        assert feature["geometry"]["type"] == "LineString"
        for lon, lat in feature["geometry"]["coordinates"]:
            assert 103.5 < lon < 104.2 and 1.1 < lat < 1.5


def test_rail_segment_uses_canonical_line_and_every_station_passed(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    assert plan.rail_segments == [("NSL", ["NS16", "NS17", "NS18", "NS19", "NS20"])]


def test_bus_steps_carry_the_service_number(bus_itineraries):
    direct = min(bus_itineraries, key=lambda i: i["transfers"])

    plan = convert(direct, pace_factor=0.6)

    assert {s.service for s in plan.steps if s.mode == "bus"} == {"851"}
    assert plan.bus_services == ["851"]
    assert plan.transfers == 0


def test_mrt_steps_are_flagged_as_tunnel_for_offline_refresh(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    assert {s.connectivity for s in plan.steps if s.mode == "train"} == {"tunnel"}
    assert {s.connectivity for s in plan.steps if s.mode != "train"} == {"online"}


def test_instructions_are_bilingual_full_sentences(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    alight = [s for s in plan.steps if s.mode == "train"][-1]
    assert alight.instruction.en == "Ride 4 stops. Get off at Novena (NS20)."
    assert alight.instruction.zh == "坐 4 站,在诺维娜(NS20)下车。"
    last = plan.steps[-1]
    assert last.instruction.zh.endswith("到陈笃生医院。")


def test_step_free_is_unverified_until_someone_checks(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    assert {s.step_free for s in plan.steps} == {"unverified"}


def test_walk_steps_carry_turn_by_turn_directions(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    first_walk = next(s for s in plan.steps if s.mode == "walk")
    assert first_walk.directions, "walking steps must offer at least a departure direction"
    assert "北" in first_walk.directions[0].zh          # recorded leg departs NORTH
    assert "120" in first_walk.directions[0].zh         # and is ~120 m
    assert "north" in first_walk.directions[0].en.lower()


def test_station_suffix_is_not_duplicated_for_english_station_names():
    from app.models import Text
    from app.services import instructions

    text = instructions.walk(4, Text(en="Boon Lay MRT Station", zh="Boon Lay MRT Station"), True)

    assert text.zh.count("地铁站") + text.zh.lower().count("mrt station") == 1
    assert "Station MRT station" not in text.en


def test_a_walk_leg_without_provider_steps_still_gets_a_direction(mrt_itinerary):
    import copy
    stripped = copy.deepcopy(mrt_itinerary)
    for leg in stripped["legs"]:
        leg.pop("steps", None)

    plan = convert(stripped, pace_factor=0.6)

    for step in plan.steps:
        if step.mode == "walk":
            assert step.directions, "geometry fallback must produce a departure direction"
            assert "米" in step.directions[0].zh


def test_ride_minutes_sit_on_the_alighting_step_not_the_boarding_one(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    board, alight = [s for s in plan.steps if s.mode == "train"]
    assert board.duration_minutes == 0, "boarding is instantaneous"
    assert alight.duration_minutes > 0, "riding N stops is what takes the minutes"


def test_every_walking_step_reports_its_distance(mrt_itinerary):
    plan = convert(mrt_itinerary, pace_factor=0.6)

    for step in plan.steps:
        if step.mode == "walk":
            assert step.distance_metres and step.distance_metres > 0
