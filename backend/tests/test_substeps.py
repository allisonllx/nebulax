from copy import deepcopy
from app.services.itinerary import convert
from app.config import SAVED_PLACES


def candidate(raw):
    return convert(raw, pace_factor=0.6, origin=SAVED_PLACES['saved-home'], destination=SAVED_PLACES['ttsh-entrance'])


def test_transit_exposes_ordered_named_stops_and_both_endpoints(mrt_itinerary):
    plan = candidate(mrt_itinerary)
    ride = [s for s in plan.steps if s.mode == 'train'][-1]
    assert [s.code for s in ride.stops] == ['NS16', 'NS17', 'NS18', 'NS19', 'NS20']
    assert ride.stops[1].name.en == 'Bishan'
    assert ride.from_place.name.en == 'Ang Mo Kio'
    assert ride.to_place.name.en == 'Novena'
    assert ride.action == 'ride'
    assert [s for s in plan.steps if s.mode == 'train'][0].action == 'board'


def test_missing_intermediate_stop_data_is_not_claimed_complete(mrt_itinerary):
    raw = deepcopy(mrt_itinerary)
    for leg in raw['legs']:
        leg.pop('intermediateStops', None)
    ride = [s for s in candidate(raw).steps if s.mode == 'train'][-1]
    assert not ride.stops_complete


def test_no_detail_keeps_walk_valid_but_does_not_invent_turns(mrt_itinerary):
    step = candidate(mrt_itinerary).steps[0]
    assert step.substeps == []
    assert step.from_place and step.to_place


def enriched():
    import json
    from pathlib import Path
    return json.loads((Path(__file__).parent / 'data/onemap_enriched.json').read_text())


def test_walking_substeps_have_geometry_and_preserve_original_total_time():
    raw = enriched()
    result = candidate(raw)
    walked = next(s for s in result.steps if s.substeps)
    assert len(walked.substeps) >= 2
    assert sum(s.duration_seconds for s in walked.substeps) == walked.duration_seconds
    assert all(len(s.coordinates) >= 2 for s in walked.substeps)
    plain = deepcopy(raw)
    for leg in plain['legs']:
        leg.pop('_walking_detail',None)
    assert result.total_seconds == candidate(plain).total_seconds
    assert result.features == candidate(plain).features


def test_different_walk_geometry_is_rejected():
    raw = enriched()
    detail = raw['legs'][0]['_walking_detail']
    detail['route_geometry'] = raw['legs'][-1]['legGeometry']['points']
    assert candidate(raw).steps[0].substeps == []


def test_malformed_walk_detail_does_not_break_base_plan():
    raw = enriched()
    raw['legs'][0]['_walking_detail']['route_instructions'] = [['broken']]
    assert candidate(raw).steps[0].substeps == []
