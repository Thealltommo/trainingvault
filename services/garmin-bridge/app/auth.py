"""Garmin authentication and swappable token persistence."""

from __future__ import annotations

import getpass
import sys
import threading
from pathlib import Path
from typing import Protocol, runtime_checkable

from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

from .config import Settings
from .errors import (
    GarminAuthenticationRequired,
    GarminRateLimited,
    GarminUpstreamUnavailable,
)


@runtime_checkable
class TokenStore(Protocol):
    """Boundary for local files today and managed secret storage later."""

    def login_source(self) -> str:
        """Return a source accepted by ``Garmin.login``."""

    def persist(self, client: Garmin) -> None:
        """Persist the client's current refreshable token state."""


class LocalTokenStore:
    """Use python-garminconnect's hardened owner-only token writer.

    On POSIX the upstream client enforces a 0700 directory and 0600 token
    file, including no-follow protection. On Windows this lives under the
    current user's profile and inherits that profile's ACL.
    """

    def __init__(self, path: Path) -> None:
        self.path = path.expanduser().resolve()

    def login_source(self) -> str:
        return str(self.path)

    def persist(self, client: Garmin) -> None:
        client.client.dump(str(self.path))


class GarminClientProvider:
    """Lazily create and reuse an authenticated synchronous Garmin client."""

    def __init__(
        self,
        settings: Settings,
        token_store: TokenStore,
        *,
        client_type: type[Garmin] = Garmin,
    ) -> None:
        self._settings = settings
        self._token_store = token_store
        self._client_type = client_type
        self._client: Garmin | None = None
        self._lock = threading.Lock()

    def _prompt_mfa(self) -> str:
        if not self._settings.interactive_auth or not sys.stdin.isatty():
            raise GarminAuthenticationRequired()
        # getpass avoids terminal echo and the value is never logged.
        return getpass.getpass("Garmin MFA code: ").strip()

    def get_client(self) -> Garmin:
        if self._client is not None:
            return self._client

        with self._lock:
            if self._client is not None:
                return self._client

            client = self._client_type(
                self._settings.email,
                self._settings.password,
                prompt_mfa=self._prompt_mfa,
            )
            try:
                client.login(self._token_store.login_source())
                # Persist after every login so token refreshes are not lost.
                self._token_store.persist(client)
            except GarminConnectTooManyRequestsError as exc:
                raise GarminRateLimited() from exc
            except GarminConnectAuthenticationError as exc:
                raise GarminAuthenticationRequired() from exc
            except GarminConnectConnectionError as exc:
                raise GarminUpstreamUnavailable() from exc
            except GarminAuthenticationRequired:
                raise
            except Exception as exc:
                # Do not surface an upstream body that may contain account data.
                raise GarminUpstreamUnavailable() from exc

            self._client = client
            return client

    def invalidate(self) -> None:
        """Drop the in-memory session after an authentication failure."""
        with self._lock:
            self._client = None
