FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    GARMIN_BRIDGE_HOST=0.0.0.0 \
    GARMIN_BRIDGE_ENV=production \
    GARMIN_TOKEN_STORE=/data/garmin

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gcc libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app

RUN python -m pip install --upgrade pip \
    && python -m pip install .

RUN mkdir -p /data/garmin

EXPOSE 8765

CMD ["python", "-m", "app"]
