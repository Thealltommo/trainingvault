"""One-time interactive local Garmin login and MFA flow."""

from __future__ import annotations

import getpass
from dataclasses import replace

from .auth import GarminClientProvider, LocalTokenStore
from .config import Settings
from .errors import GarminBridgeError


def main() -> None:
    """Authenticate interactively and save only tokens, never credentials."""
    settings = Settings.from_env()
    email = settings.email or input("Garmin email: ").strip()
    password = settings.password or getpass.getpass("Garmin password: ")
    interactive = replace(
        settings,
        email=email,
        password=password,
        interactive_auth=True,
    )
    provider = GarminClientProvider(
        interactive,
        LocalTokenStore(interactive.token_store_path),
    )

    try:
        provider.get_client()
    except GarminBridgeError as exc:
        raise SystemExit(exc.public_message) from None

    print(f"Garmin tokens saved under {interactive.token_store_path}.")


if __name__ == "__main__":
    main()
