"""Run the bridge with ``python -m app``."""

from __future__ import annotations

import uvicorn

from .config import Settings


def main() -> None:
    """Start the local Garmin bridge."""
    settings = Settings.from_env()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
