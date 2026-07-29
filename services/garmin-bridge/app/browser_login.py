"""One-time browser-assisted Garmin authentication bootstrap.

Credentials and verification codes stay inside Garmin's headed Chromium page.
Garmin chooses its current login route from the normal Connect entry point.
An unconsumed Connect service ticket is handed to python-garminconnect, which
performs its native DI OAuth exchange and owns token serialization.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import re
import sys
import tempfile
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import (
    parse_qs,
    unquote,
    unquote_plus,
    urljoin,
    urlsplit,
    urlunsplit,
)

from garminconnect import Garmin
from garminconnect import client as garmin_client

from .auth import GarminClientProvider, LocalTokenStore, TokenStore
from .config import Settings, token_store_path_from_env

GARMIN_CONNECT_ENTRY_URL = "https://connect.garmin.com/modern/"
SOCIAL_PROFILE_PATH = "/userprofile-service/socialProfile"
CURRENT_USER_PATH = "/app/currentuser-service/user/info"
DEFAULT_TIMEOUT_SECONDS = 600
AUTH_ARTIFACT_GRACE_SECONDS = 5.0

# Match the installed upstream client's service-ticket extraction boundary.
_SERVICE_TICKET_RE = re.compile(r'ST-[^"&\s]+')
_AUTH_RESPONSE_HOSTS = {"sso.garmin.com"}
_CONNECT_AUTH_COOKIE_NAMES = {"JWT_WEB"}


class BrowserBootstrapError(RuntimeError):
    """A redacted browser-bootstrap failure safe to show in a terminal."""


class _Provider(Protocol):
    def get_client(self) -> Garmin:
        """Return a client restored from the configured token store."""


@dataclass(frozen=True, slots=True)
class BootstrapResult:
    """Non-sensitive proof returned after a complete cold restore."""

    token_file: Path
    device_count: int


@dataclass(frozen=True, slots=True)
class BrowserExchange:
    """Sensitive one-time artifact plus its exact CAS service scope."""

    ticket: str = field(repr=False)
    service_url: str


@dataclass(slots=True)
class _BrowserCapture:
    exchange: BrowserExchange | None = field(default=None, repr=False)
    browser_authenticated: bool = False
    connect_authenticated: bool = False
    connect_navigation_started: bool = False
    non_connect_authenticated: bool = False
    _auth_status_emitted: bool = False
    _exchange_status_emitted: bool = False

    def mark_authenticated(
        self,
        status_callback: Callable[[str], None],
        *,
        connect: bool = False,
        non_connect: bool = False,
    ) -> None:
        self.browser_authenticated = True
        self.connect_authenticated = self.connect_authenticated or connect
        self.non_connect_authenticated = (
            self.non_connect_authenticated or non_connect
        )
        if not self._auth_status_emitted:
            status_callback("Browser authenticated.")
            self._auth_status_emitted = True

    def accept(
        self,
        ticket: Any,
        service_url: Any,
        status_callback: Callable[[str], None],
        *,
        authoritative_service: bool = False,
    ) -> bool:
        if not isinstance(ticket, str):
            return False
        if (
            len(ticket) > 2048
            or _SERVICE_TICKET_RE.fullmatch(ticket) is None
            or not _is_connect_service_url(service_url)
        ):
            return False
        if self.exchange is not None:
            if (
                authoritative_service
                and self.exchange.ticket == ticket
                and self.exchange.service_url != service_url
            ):
                self.exchange = BrowserExchange(
                    ticket=ticket,
                    service_url=service_url,
                )
            return self.exchange.ticket == ticket
        self.mark_authenticated(status_callback)
        self.exchange = BrowserExchange(
            ticket=ticket,
            service_url=service_url,
        )
        if not self._exchange_status_emitted:
            status_callback("Garmin ticket/session captured.")
            self._exchange_status_emitted = True
        return True


def _discard_status(_message: str) -> None:
    """Default status sink for tests and library-style callers."""


def _is_garmin_https_url(value: Any) -> bool:
    if not isinstance(value, str) or len(value) > 4096:
        return False
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        return bool(
            parsed.scheme == "https"
            and hostname
            and (hostname == "garmin.com" or hostname.endswith(".garmin.com"))
            and parsed.username is None
            and parsed.password is None
            and parsed.port in {None, 443}
        )
    except ValueError:
        return False


def _is_connect_service_url(value: Any) -> bool:
    if not _is_garmin_https_url(value):
        return False
    parsed = urlsplit(value)
    return (
        parsed.hostname == "connect.garmin.com"
        and parsed.fragment == ""
        and "ticket" not in parse_qs(parsed.query, keep_blank_values=True)
    )


def _is_trusted_auth_response_url(url: str) -> bool:
    parsed = urlsplit(url)
    return bool(
        parsed.scheme == "https"
        and parsed.hostname in _AUTH_RESPONSE_HOSTS
        and (
            "/api/" in parsed.path
            or "/auth/" in parsed.path
            or "/sso/" in parsed.path
        )
    )


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None


def _service_from_auth_response(
    response_url: str,
    payload: Mapping[str, Any],
) -> str | None:
    query = parse_qs(urlsplit(response_url).query, keep_blank_values=True)
    query_service = next(iter(query.get("service", [])), None)
    raw_candidates = (
        query_service,
        payload.get("serviceURL"),
        payload.get("serviceUrl"),
        payload.get("service_url"),
    )
    for value in raw_candidates:
        if not isinstance(value, str) or not value:
            continue
        if _is_garmin_https_url(value):
            return value
        decoded = unquote(value)
        if decoded != value and _is_garmin_https_url(decoded):
            return decoded
    return None


def _exchange_from_connect_navigation(url: str) -> BrowserExchange | None:
    """Extract an ST while preserving the exact ticket-free service URL."""
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "connect.garmin.com"
        or parsed.username is not None
        or parsed.password is not None
    ):
        return None

    ticket: str | None = None
    remaining_query_parts: list[str] = []
    for raw_part in parsed.query.split("&"):
        if not raw_part:
            continue
        raw_key, separator, raw_value = raw_part.partition("=")
        if unquote_plus(raw_key) != "ticket":
            remaining_query_parts.append(raw_part)
            continue
        candidate = unquote_plus(raw_value if separator else "")
        if (
            len(candidate) <= 2048
            and _SERVICE_TICKET_RE.fullmatch(candidate) is not None
        ):
            ticket = candidate

    if ticket is None:
        return None

    service_url = urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            "&".join(remaining_query_parts),
            "",
        )
    )
    if not _is_connect_service_url(service_url):
        return None
    return BrowserExchange(ticket=ticket, service_url=service_url)


def _capture_auth_response(
    response: Any,
    capture: _BrowserCapture,
    status_callback: Callable[[str], None] = _discard_status,
) -> None:
    """Observe trusted Garmin auth responses without assuming a fixed endpoint."""
    try:
        response_url = response.url
        if not _is_trusted_auth_response_url(response_url):
            return
        if not 200 <= response.status < 300:
            return
        payload = response.json()
        if not isinstance(payload, Mapping):
            return
        status = payload.get("responseStatus")
        if not isinstance(status, Mapping) or status.get("type") != "SUCCESSFUL":
            return

        service_url = _service_from_auth_response(response_url, payload)
        ticket = _first_string(
            payload.get("serviceTicketId"),
            payload.get("serviceTicket"),
        )
        if capture.accept(ticket, service_url, status_callback):
            return

        if _is_connect_service_url(service_url):
            capture.mark_authenticated(status_callback, connect=True)
        elif _is_garmin_https_url(service_url):
            capture.mark_authenticated(status_callback, non_connect=True)
    except Exception:
        # Event callbacks must never expose an upstream body or account data.
        return


def _observe_response(
    response: Any,
    capture: _BrowserCapture,
    status_callback: Callable[[str], None] = _discard_status,
) -> None:
    """Observe current-flow auth signals and redirect metadata."""
    _capture_auth_response(response, capture, status_callback)
    try:
        response_url = response.url
        parsed = urlsplit(response_url)
        if (
            parsed.scheme == "https"
            and parsed.hostname == "connect.garmin.com"
            and parsed.path == CURRENT_USER_PATH
            and 200 <= response.status < 300
        ):
            current_user = response.json()
            if isinstance(current_user, Mapping) and current_user:
                capture.mark_authenticated(status_callback, connect=True)

        location = response.headers.get("location")
        if _is_garmin_https_url(response_url) and isinstance(location, str):
            exchange = _exchange_from_connect_navigation(
                urljoin(response_url, location)
            )
            if exchange is not None:
                capture.accept(
                    exchange.ticket,
                    exchange.service_url,
                    status_callback,
                    authoritative_service=True,
                )
    except Exception:
        return


def _route_without_consuming_ticket(
    route: Any,
    capture: _BrowserCapture,
    status_callback: Callable[[str], None] = _discard_status,
) -> None:
    """Stop Connect consuming a ticket reserved for native DI exchange."""
    exchange = _exchange_from_connect_navigation(route.request.url)
    if exchange is not None:
        capture.accept(
            exchange.ticket,
            exchange.service_url,
            status_callback,
            authoritative_service=True,
        )
        route.abort()
        return
    route.continue_()


def _page_is_connect_application(page: Any) -> bool:
    try:
        parsed = urlsplit(page.url)
        path = parsed.path.rstrip("/")
        return bool(
            parsed.scheme == "https"
            and parsed.hostname == "connect.garmin.com"
            and (
                path == "/app"
                or path.startswith("/app/")
                or path == "/modern"
                or path.startswith("/modern/")
            )
            and "ticket" not in parse_qs(parsed.query, keep_blank_values=True)
        )
    except Exception:
        return False


def _observe_authenticated_connect_context(
    context: Any,
    open_pages: list[Any],
    capture: _BrowserCapture,
    status_callback: Callable[[str], None],
) -> None:
    """Treat a real Connect page plus JWT_WEB as browser-auth success."""
    try:
        # Let Playwright apply both domain and path matching. Querying the
        # application paths also covers a JWT_WEB cookie scoped below "/".
        cookies = context.cookies(
            [
                GARMIN_CONNECT_ENTRY_URL,
                "https://connect.garmin.com/app/",
            ]
        )
        authenticated_cookie = any(
            cookie.get("name") in _CONNECT_AUTH_COOKIE_NAMES
            and bool(cookie.get("value"))
            for cookie in cookies
            if isinstance(cookie, Mapping)
        )
    except Exception:
        authenticated_cookie = False

    if authenticated_cookie and any(
        _page_is_connect_application(page) for page in open_pages
    ):
        capture.mark_authenticated(status_callback, connect=True)


def _playwright_factory() -> Any:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserBootstrapError(
            "Playwright is not installed. Reinstall the Garmin bridge dependencies."
        ) from exc
    return sync_playwright


def capture_service_ticket(
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    *,
    playwright_factory: Callable[[], Any] | None = None,
    monotonic: Callable[[], float] = time.monotonic,
    status_callback: Callable[[str], None] = _discard_status,
) -> BrowserExchange:
    """Open Garmin's current public flow and preserve a native exchange artifact."""
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")

    factory = playwright_factory or _playwright_factory()
    capture = _BrowserCapture()
    browser: Any = None
    context: Any = None

    try:
        with factory() as playwright:
            try:
                browser = playwright.chromium.launch(headless=False)
            except Exception as exc:
                raise BrowserBootstrapError(
                    "Chromium could not start. Run "
                    "'python -m playwright install chromium' and try again."
                ) from exc

            try:
                # This is intentionally non-persistent: no user_data_dir,
                # storage_state, HAR, trace, video, or cookie export.
                context = browser.new_context()
                context.route(
                    "https://connect.garmin.com/**",
                    lambda route: _route_without_consuming_ticket(
                        route,
                        capture,
                        status_callback,
                    ),
                )
                context.on(
                    "response",
                    lambda response: _observe_response(
                        response,
                        capture,
                        status_callback,
                    ),
                )
                page = context.new_page()
                try:
                    page.goto(
                        GARMIN_CONNECT_ENTRY_URL,
                        wait_until="commit",
                        timeout=30_000,
                    )
                except Exception as exc:
                    raise BrowserBootstrapError(
                        "Garmin Connect's public login entry could not be opened."
                    ) from exc

                deadline = monotonic() + timeout_seconds
                connect_authenticated_at: float | None = None
                while capture.exchange is None and monotonic() < deadline:
                    open_pages = [
                        candidate
                        for candidate in context.pages
                        if not candidate.is_closed()
                    ]
                    if capture.exchange is not None:
                        break
                    if not open_pages:
                        if capture.browser_authenticated:
                            raise _authenticated_without_exchange_error(capture)
                        raise BrowserBootstrapError(
                            "The browser was closed before Garmin login completed."
                        )

                    _observe_authenticated_connect_context(
                        context,
                        open_pages,
                        capture,
                        status_callback,
                    )
                    if capture.exchange is not None:
                        break
                    if capture.connect_authenticated:
                        now = monotonic()
                        if connect_authenticated_at is None:
                            connect_authenticated_at = now
                        elif (
                            now - connect_authenticated_at
                            >= AUTH_ARTIFACT_GRACE_SECONDS
                        ):
                            raise _authenticated_without_exchange_error(
                                capture
                            )

                    if (
                        capture.non_connect_authenticated
                        and not capture.connect_navigation_started
                    ):
                        capture.connect_navigation_started = True
                        try:
                            open_pages[-1].goto(
                                GARMIN_CONNECT_ENTRY_URL,
                                wait_until="commit",
                                timeout=30_000,
                            )
                        except Exception as exc:
                            if capture.exchange is not None:
                                break
                            raise BrowserBootstrapError(
                                "Garmin Account authenticated, but Garmin Connect "
                                "could not complete SSO in the same browser."
                            ) from exc

                    try:
                        # This pumps Playwright events without inspecting form
                        # fields, request bodies, or credential-bearing storage.
                        open_pages[-1].wait_for_timeout(100)
                    except Exception as exc:
                        if capture.exchange is not None:
                            break
                        remaining_pages = [
                            candidate
                            for candidate in context.pages
                            if not candidate.is_closed()
                        ]
                        if remaining_pages:
                            continue
                        if capture.browser_authenticated:
                            raise _authenticated_without_exchange_error(
                                capture
                            ) from exc
                        raise BrowserBootstrapError(
                            "The browser closed before Garmin login completed."
                        ) from exc

                if capture.exchange is None:
                    if capture.browser_authenticated:
                        raise _authenticated_without_exchange_error(capture)
                    raise BrowserBootstrapError(
                        "Garmin login did not complete before the browser timeout."
                    )
                return capture.exchange
            finally:
                if context is not None:
                    with contextlib.suppress(Exception):
                        context.close()
                if browser is not None:
                    with contextlib.suppress(Exception):
                        browser.close()
    except BrowserBootstrapError:
        raise
    except Exception as exc:
        raise BrowserBootstrapError(
            "The browser authentication session could not be completed."
        ) from exc


def _authenticated_without_exchange_error(
    capture: _BrowserCapture,
) -> BrowserBootstrapError:
    if capture.connect_authenticated:
        return BrowserBootstrapError(
            "Garmin Connect authenticated in the browser, but no unconsumed "
            "Connect service ticket compatible with python-garminconnect 0.3.7 "
            "was exposed. Browser cookies cannot be promoted to the native "
            "refreshable token store, and no credentials were retried."
        )
    return BrowserBootstrapError(
        "Garmin browser authentication succeeded, but the current flow did not "
        "expose an unconsumed Connect service ticket compatible with "
        "python-garminconnect 0.3.7. No token state was written and no "
        "credentials were retried."
    )


def exchange_browser_ticket(
    client: Garmin,
    ticket: str,
    service_url: str,
) -> None:
    """Use python-garminconnect 0.3.7's native service-ticket exchange."""
    if (
        len(ticket) > 2048
        or _SERVICE_TICKET_RE.fullmatch(ticket) is None
    ):
        raise BrowserBootstrapError("Garmin returned an invalid service ticket.")
    if not _is_connect_service_url(service_url):
        raise BrowserBootstrapError(
            "Garmin returned an invalid Connect service URL."
        )

    native_client = client.client
    exchange = getattr(native_client, "_exchange_service_ticket", None)
    if not callable(exchange):
        raise BrowserBootstrapError(
            "The installed python-garminconnect version is not compatible with "
            "browser bootstrap."
        )

    try:
        exchange(ticket, service_url=service_url)
    except Exception as exc:
        raise BrowserBootstrapError(
            "Garmin did not accept the authenticated browser session."
        ) from exc

    if not all(
        (
            getattr(native_client, "di_token", None),
            getattr(native_client, "di_refresh_token", None),
            getattr(native_client, "di_client_id", None),
        )
    ):
        raise BrowserBootstrapError(
            "Garmin did not return complete refreshable authentication state."
        )


def _verify_exchanged_session(client: Garmin) -> None:
    """Require a conclusive authenticated response before writing tokens."""
    try:
        # Use the public wrapper so transient network/5xx failures get the
        # library's bounded retry policy. Auth failures and 4xx still fail fast.
        profile = client.connectapi(SOCIAL_PROFILE_PATH)
    except Exception as exc:
        raise BrowserBootstrapError(
            "Garmin rejected the exchanged session during verification."
        ) from exc
    if not isinstance(profile, Mapping) or not profile:
        raise BrowserBootstrapError(
            "Garmin returned an invalid profile during session verification."
        )


def _verify_restored_client(
    client: Garmin,
    status_callback: Callable[[str], None] = _discard_status,
) -> int:
    """Exercise the same profile and device methods used by the bridge."""
    try:
        profile = client.get_user_profile()
    except Exception as exc:
        raise BrowserBootstrapError(
            "The saved token store could not call the Garmin profile API."
        ) from exc

    if not isinstance(profile, Mapping) or not profile:
        raise BrowserBootstrapError(
            "The saved token store returned an invalid Garmin profile."
        )

    status_callback("Verifying devices.")
    try:
        devices = client.get_devices()
    except Exception as exc:
        raise BrowserBootstrapError(
            "The saved token store could not call the Garmin device API."
        ) from exc

    if isinstance(devices, Mapping):
        devices = devices.get("devices")
    if not isinstance(devices, list):
        raise BrowserBootstrapError(
            "The saved token store returned an invalid Garmin device list."
        )
    if not devices:
        raise BrowserBootstrapError(
            "The saved token store returned no registered Garmin devices."
        )
    return len(devices)


def _restore_and_verify(
    settings: Settings,
    store: TokenStore,
    provider_factory: Callable[[Settings, TokenStore], _Provider],
    status_callback: Callable[[str], None] = _discard_status,
) -> int:
    token_only_settings = replace(
        settings,
        email=None,
        password=None,
        interactive_auth=False,
    )
    try:
        restored = provider_factory(token_only_settings, store).get_client()
    except Exception as exc:
        raise BrowserBootstrapError(
            "The normal Garmin provider could not restore the saved token state."
        ) from exc
    return _verify_restored_client(restored, status_callback)


def _persist_verify_and_promote_local(
    client: Garmin,
    settings: Settings,
    store: LocalTokenStore,
    provider_factory: Callable[[Settings, TokenStore], _Provider],
    status_callback: Callable[[str], None] = _discard_status,
) -> tuple[Path, int]:
    """Prove a staged store before atomically replacing the active token file."""
    # Keep the destination lexical. Resolving an existing token-file symlink
    # would redirect os.replace to its target instead of replacing the link.
    token_file = garmin_client.token_file_path(store.login_source())
    try:
        token_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with contextlib.suppress(OSError):
            token_file.parent.chmod(0o700)

        with tempfile.TemporaryDirectory(
            prefix=".trainvault-garmin-bootstrap-",
            dir=token_file.parent,
            ignore_cleanup_errors=True,
        ) as staging_directory:
            staging_store = LocalTokenStore(Path(staging_directory))
            staged_file = garmin_client.token_file_path(
                staging_store.login_source()
            ).resolve()
            try:
                staging_store.persist(client)
                staging_settings = replace(
                    settings,
                    token_store_path=staging_store.path,
                )
                device_count = _restore_and_verify(
                    staging_settings,
                    staging_store,
                    provider_factory,
                    status_callback,
                )
                os.replace(staged_file, token_file)
                with contextlib.suppress(OSError):
                    token_file.chmod(0o600)
            finally:
                # On every pre-promotion failure, remove refreshable token
                # material explicitly rather than relying only on temp cleanup.
                if staged_file.exists() or staged_file.is_symlink():
                    try:
                        staged_file.unlink()
                    except OSError as exc:
                        raise BrowserBootstrapError(
                            "Temporary Garmin token state could not be removed."
                        ) from exc
    except BrowserBootstrapError:
        raise
    except Exception as exc:
        raise BrowserBootstrapError(
            "The verified Garmin token state could not be persisted."
        ) from exc

    status_callback("Token store promoted.")
    return token_file, device_count


def bootstrap_token_store(
    ticket: str,
    settings: Settings,
    *,
    service_url: str,
    client_factory: Callable[[], Garmin] = Garmin,
    token_store: TokenStore | None = None,
    provider_factory: Callable[[Settings, TokenStore], _Provider] = (
        GarminClientProvider
    ),
    status_callback: Callable[[str], None] = _discard_status,
) -> BootstrapResult:
    """Exchange, verify, persist, then prove a credential-free cold restore."""
    store = token_store or LocalTokenStore(settings.token_store_path)
    client = client_factory()

    status_callback("Exchanging tokens.")
    exchange_browser_ticket(client, ticket, service_url)
    status_callback("Verifying profile.")
    _verify_exchanged_session(client)

    if isinstance(store, LocalTokenStore):
        token_file, device_count = _persist_verify_and_promote_local(
            client,
            settings,
            store,
            provider_factory,
            status_callback,
        )
    else:
        try:
            store.persist(client)
        except Exception as exc:
            raise BrowserBootstrapError(
                "The verified Garmin token state could not be persisted."
            ) from exc
        device_count = _restore_and_verify(
            settings,
            store,
            provider_factory,
            status_callback,
        )
        token_file = garmin_client.token_file_path(
            str(settings.token_store_path.expanduser().resolve())
        )
        status_callback("Token store promoted.")

    return BootstrapResult(
        token_file=token_file,
        device_count=device_count,
    )


def _positive_timeout(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("timeout must be an integer") from exc
    if not 30 <= parsed <= 3600:
        raise argparse.ArgumentTypeError(
            "timeout must be between 30 and 3600 seconds"
        )
    return parsed


def main() -> None:
    """Run the one-time browser bootstrap without accepting credentials."""
    parser = argparse.ArgumentParser(
        description=(
            "Open Garmin in a visible browser and save reusable bridge tokens."
        )
    )
    parser.add_argument(
        "--token-store",
        type=Path,
        help=(
            "Token directory or .json path. Defaults to the process-level "
            "GARMIN_TOKEN_STORE or ~/.trainvault/garmin."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=_positive_timeout,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Seconds allowed for manual Garmin login (default: 600).",
    )
    args = parser.parse_args()

    token_store_path = (
        args.token_store.expanduser()
        if args.token_store is not None
        else token_store_path_from_env(load_environment_file=False)
    )
    settings = Settings(
        email=None,
        password=None,
        token_store_path=token_store_path,
    )

    print("Opening Garmin login in a private, temporary Chromium window.")
    print("Enter credentials and any verification only in Garmin's webpage.")
    print("CAPTCHA and other Garmin security checks will run normally.")

    try:
        exchange = capture_service_ticket(
            args.timeout,
            status_callback=print,
        )
        result = bootstrap_token_store(
            exchange.ticket,
            settings,
            service_url=exchange.service_url,
            status_callback=print,
        )
    except KeyboardInterrupt:
        print("\nGarmin browser login cancelled.", file=sys.stderr)
        raise SystemExit(130) from None
    except BrowserBootstrapError as exc:
        print(f"Garmin browser login failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
    except Exception:
        # Keep unexpected upstream/browser details out of terminal output.
        print(
            "Garmin browser login failed before reusable authentication "
            "could be verified.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None

    print(f"Reusable Garmin authentication saved to: {result.token_file}")
    print(
        "Saved-token startup verified through the normal provider "
        f"(profile and {result.device_count} device(s))."
    )


if __name__ == "__main__":
    main()
