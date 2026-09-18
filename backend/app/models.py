"""The frontend contract. Field names here are what the screens receive (camelCase on the wire)."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Text(ApiModel):
    en: str
    zh: str


class Place(ApiModel):
    lat: float
    lon: float
    name: Text


Mode = Literal["walk", "bus", "train"]


class Step(ApiModel):
    id: str
    leg_id: str
    mode: Mode
    line: str | None = None
    service: str | None = None
    instruction: Text
    detail: Text
    confirmation: Text
    place: Text
    duration_minutes: int = 0
    duration_seconds: int | None = None
    distance_metres: int | None = None
    step_free: Literal["verified", "unverified", "blocked"] = "unverified"
    connectivity: Literal["online", "tunnel"] = "online"
    crowd_level: Literal["l", "m", "h"] | None = None  # None = unknown, never "fine"
    bus_load: Literal["SEA", "SDA", "LSD"] | None = None


class Alert(ApiModel):
    id: str
    type: Literal["train_disruption", "lift_maintenance", "bus_diversion", "weather"]
    severity: Literal["minor", "major"]
    planned: bool
    message: Text
    line: str | None = None
    station_codes: list[str] = []
    free_public_bus_station_codes: list[str] = []
    affects_journey: bool
    affected_leg_ids: list[str] = []
    source: str
    data_source: Literal["live", "verified", "simulated"]
    source_updated_at: datetime | None = None


class ArrivalWindow(ApiModel):
    earliest: datetime
    latest: datetime


class Journey(ApiModel):
    id: str
    origin: Place | None = None
    destination: Place | None = None
    version: int
    status: Literal["ready"] = "ready"
    data_mode: Literal["live", "simulated"]
    updated_at: datetime
    arrive_by: datetime
    departure_time: datetime
    arrival_window: ArrivalWindow
    walk_distance_metres: int
    transfers: int
    summary: Text
    reasons: list[Text] = []
    steps: list[Step]
    route_geometry: dict[str, Any]  # GeoJSON FeatureCollection, [longitude, latitude]
    alerts: list[Alert] = []
    # Populated only on the plan response: genuinely different ways to make the trip,
    # for the caregiver to choose from during setup. Each is registered server-side,
    # so refreshing an alternative's id evaluates conditions against THAT route.
    alternatives: list["Journey"] = []


class PlacePin(ApiModel):
    """An ad-hoc location chosen in the app (usually via geocoding)."""
    lat: float
    lon: float
    name: str


class PlanRequest(ApiModel):
    origin: str | PlacePin = "saved-home"
    destination: str | PlacePin = "ttsh-entrance"
    arrive_by: datetime
    step_free: bool = True
    walking_speed_factor: float = 0.6


class RefreshRequest(ApiModel):
    version: int
    last_confirmed_step_id: str | None = None


class HelpAction(ApiModel):
    type: Literal["call"]
    label: Text


class RefreshResponse(ApiModel):
    result: Literal["unchanged", "replacement_available", "no_accessible_route"]
    # Alias kept in sync with `result` — the deployed frontend discriminates on `status`.
    status: Literal["unchanged", "replacement_available", "no_accessible_route"] | None = None
    checked_at: datetime
    data_freshness: Literal["fresh", "unknown"] = "fresh"  # unknown = a feed failed; not an all-clear
    journey: Journey | None = None
    message: Text | None = None
    alerts: list[Alert] = []
    help_actions: list[HelpAction] = []
