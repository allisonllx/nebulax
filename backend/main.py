import os
import pathlib

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.journeys import router as journeys_router

app = FastAPI(title="NebulaX API", version="0.1.0")
app.include_router(journeys_router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# In the container the built frontend sits next to us; in development Vite serves itself.
_static = os.environ.get("STATIC_DIR")
if _static and pathlib.Path(_static).is_dir():
    static_dir = pathlib.Path(_static)
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(static_dir):
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")
