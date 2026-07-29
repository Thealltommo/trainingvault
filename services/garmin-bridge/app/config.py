"""Environment-only configuration for the Garmin bridge."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


def _as_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def token_store_path_from_env(
    *,
    load_environment_file: bool = True,
) -> Path:
    """Resolve only the token-store setting needed by bootstrap commands."""
    if load_environment_file:
        load_dotenv(override=False)

    configured_path = os.getenv("GARMIN_TOKEN_STORE", "").strip()
    return (
        Path(configured_path).expanduser()
        if configured_path
        else Path.home() / ".trainvault" / "garmin"
    )


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings.

    Credentials are optional because an existing token store is preferred.
    They are never included in model representations or application logs.
    """

    email: str | None = field(repr=False)
    password: str | None = field(repr=False)
    token_store_path: Path
    api_token: str | None = field(default=None, repr=False)
    interactive_auth: bool = False
    host: str = "127.0.0.1"
    port: int = 8765

    @classmethod
    def from_env(cls, *, load_environment_file: bool = True) -> "Settings":
        """Build settings from the process environment.

        Local ``.env`` loading is convenient for the standalone service; the
        file remains ignored. Production should inject environment variables.
        """
        if load_environment_file:
            load_dotenv(override=False)

        token_store_path = token_store_path_from_env(
            load_environment_file=False,
        )

        port_value = os.getenv("GARMIN_BRIDGE_PORT", "").strip()
        try:
            port = int(port_value) if port_value else 8765
        except ValueError as exc:
            raise ValueError("GARMIN_BRIDGE_PORT must be an integer") from exc

        if not 1 <= port <= 65_535:
            raise ValueError("GARMIN_BRIDGE_PORT must be between 1 and 65535")

        return cls(
            email=os.getenv("GARMIN_EMAIL") or None,
            password=os.getenv("GARMIN_PASSWORD") or None,
            token_store_path=token_store_path,
            api_token=os.getenv("GARMIN_BRIDGE_API_TOKEN") or None,
            interactive_auth=_as_bool(os.getenv("GARMIN_INTERACTIVE_AUTH")),
            host=os.getenv("GARMIN_BRIDGE_HOST", "").strip() or "127.0.0.1",
            port=port,
        )
