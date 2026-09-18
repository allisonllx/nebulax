"""OneMap routing client. Tokens expire every 3 days; refresh from email + password when configured."""
import asyncio
import time
from datetime import datetime

import httpx

from app import config

BASE = "https://www.onemap.gov.sg/api"
_TOKEN_SAFETY_S = 3600  # refresh an hour before expiry


class OneMapClient:
    def __init__(self):
        self._token = config.env("ONEMAP_TOKEN")
        self._expires_at = _decode_expiry(self._token) if self._token else 0.0
        self._lock = asyncio.Lock()

    async def _current_token(self) -> str:
        async with self._lock:
            if self._token and time.time() < self._expires_at - _TOKEN_SAFETY_S:
                return self._token
            email, password = config.env("ONEMAP_EMAIL"), config.env("ONEMAP_PASSWORD")
            if not (email and password):
                if self._token:
                    return self._token  # may still work; better than failing while unconfigured
                raise RuntimeError("OneMap credentials missing: set ONEMAP_TOKEN or ONEMAP_EMAIL/PASSWORD")
            async with httpx.AsyncClient(timeout=30) as http:
                r = await http.post(f"{BASE}/auth/post/getToken", json={"email": email, "password": password})
                r.raise_for_status()
                body = r.json()
            self._token = body["access_token"]
            self._expires_at = float(body.get("expiry_timestamp", time.time() + 3 * 86400))
            return self._token

    async def search(self, query: str) -> list[dict]:
        """OneMap address/place search, raw result rows."""
        token = await self._current_token()
        async with httpx.AsyncClient(timeout=30, headers={"Authorization": token}) as http:
            r = await http.get(f"{BASE}/common/elastic/search",
                               params={"searchVal": query, "returnGeom": "Y",
                                       "getAddrDetails": "Y", "pageNum": 1})
            r.raise_for_status()
            return r.json().get("results", [])

    async def route_candidates(self, origin, destination, arrive_by: datetime) -> list[dict]:
        """Transit and bus-only itineraries for the trip, as raw OneMap dicts."""
        token = await self._current_token()
        params_common = {
            "start": f"{origin.lat},{origin.lon}", "end": f"{destination.lat},{destination.lon}",
            "routeType": "pt", "date": arrive_by.strftime("%m-%d-%Y"),
            "time": arrive_by.strftime("%H:%M:%S"),
            "maxWalkDistance": 1000, "numItineraries": 3,
        }
        out: list[dict] = []
        async with httpx.AsyncClient(timeout=30, headers={"Authorization": token}) as http:
            for mode in ("TRANSIT", "BUS"):
                r = await http.get(f"{BASE}/public/routingsvc/route", params={**params_common, "mode": mode})
                r.raise_for_status()
                out.extend(r.json().get("plan", {}).get("itineraries", []))
        return out


def _decode_expiry(token: str) -> float:
    import base64
    import json
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return float(json.loads(base64.urlsafe_b64decode(payload))["exp"])
    except Exception:
        return 0.0
