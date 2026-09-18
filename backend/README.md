# NebulaX backend

FastAPI application using Python 3.12+ and uv.

```sh
uv sync --locked
uv run fastapi dev main.py
```

- API docs: http://127.0.0.1:8000/docs
- Health endpoint: `GET /api/health` returns `{"status": "ok"}`.

See [local development](../DEVELOPMENT.md) for the full setup.
