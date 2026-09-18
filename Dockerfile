# Stage 1: build the frontend
FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# VITE_MAPTILER_KEY is baked into the static bundle (tile keys are public by design;
# restrict it to our domains in the MapTiler dashboard instead).
ARG VITE_MAPTILER_KEY
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY
RUN npm run build

# Stage 2: run FastAPI, serving /api and the built frontend
FROM python:3.12-slim
WORKDIR /srv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY backend/ ./
COPY --from=frontend /build/dist ./static
ENV PATH="/srv/.venv/bin:$PATH" STATIC_DIR=/srv/static
EXPOSE 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
