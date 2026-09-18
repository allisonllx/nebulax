"""Journey storage. In-memory for now; the interface is what /refresh needs, so a Firestore
implementation can replace it without touching the services."""
from dataclasses import dataclass
from datetime import datetime

from app.models import PlanRequest


@dataclass
class StoredJourney:
    request: PlanRequest
    raw_itineraries: list[dict]  # candidates fetched at plan time; refresh re-ranks without re-fetching
    version: int
    created_at: datetime


class JourneyStore:
    def __init__(self):
        self._journeys: dict[str, StoredJourney] = {}

    def put(self, journey_id: str, stored: StoredJourney):
        self._journeys[journey_id] = stored

    def get(self, journey_id: str) -> StoredJourney | None:
        return self._journeys.get(journey_id)

    def bump_version(self, journey_id: str, version: int):
        self._journeys[journey_id].version = version
