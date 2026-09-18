from fastapi import FastAPI

from app.api.journeys import router as journeys_router

app = FastAPI(title="NebulaX API", version="0.1.0")
app.include_router(journeys_router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
