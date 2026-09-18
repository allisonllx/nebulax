"""data.gov.sg real-time weather client. No key required."""
import httpx

BASE = "https://api-open.data.gov.sg/v2/real-time/api"


async def two_hour_forecast() -> dict:
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(f"{BASE}/two-hr-forecast")
        r.raise_for_status()
        return r.json()
