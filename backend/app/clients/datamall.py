"""LTA DataMall client. Thin: fetch and return raw JSON, no business logic."""
import httpx

from app import config

BASE = "https://datamall2.mytransport.sg/ltaodataservice"


async def train_service_alerts() -> dict:
    key = config.env("LTA_DATAMALL_ACCOUNT_KEY")
    if not key:
        raise RuntimeError("LTA_DATAMALL_ACCOUNT_KEY not set")
    async with httpx.AsyncClient(timeout=30, headers={"AccountKey": key, "accept": "application/json"}) as http:
        r = await http.get(f"{BASE}/TrainServiceAlerts")
        r.raise_for_status()
        return r.json()


async def facilities_maintenance() -> dict:
    key = config.env("LTA_DATAMALL_ACCOUNT_KEY")
    if not key:
        raise RuntimeError("LTA_DATAMALL_ACCOUNT_KEY not set")
    async with httpx.AsyncClient(timeout=30, headers={"AccountKey": key, "accept": "application/json"}) as http:
        r = await http.get(f"{BASE}/v2/FacilitiesMaintenance")
        r.raise_for_status()
        return r.json()
