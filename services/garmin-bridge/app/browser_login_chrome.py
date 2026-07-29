"""One-time Garmin bootstrap using an uncontrolled Chrome login phase.

Credential entry happens in a normal installed Chrome process with a dedicated
persistent profile. Only after the user finishes signing in do we reopen the
same profile under Playwright to capture a Connect service ticket and hand it
to python-garminconnect for native token exchange.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable

from .browser_login import (
    AUTH_ARTIFACT_GRACE_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    GARMIN_CONNECT_ENTRY_URL,
    BrowserBootstrapError,
    BrowserExchange,
    _BrowserCapture,
    _authenticated_without_exchange_error,
    _observe_authenticated_connect_context,
    _observe_response,
    _playwright_factory,
    _positive_timeout,
    _route_without_consuming_ticket,
    bootstrap_token_store,
)
from .config import Settings, token_store_path_from_env

GARMIN_ACCOUNT_ENTRY_URL = "https://www.garmin.com/account/"
DEFAULT_PROFILE_DIR = Path.home() / ".trainvault" / "garmin-browser-profile"


def _find_chrome_executable() -> Path:
    """Find installed Google Chrome, with an explicit override for odd layouts."""
    override = os.environ.get("GARMIN_BROWSER_EXECUTABLE", "").strip()
    candidates: list[Path] = []
    if override:
        candidates.append(Path(override).expanduser())

    for command in ("chrome", "google-chrome", "google-chrome-stable"):
        resolved = shutil.which(command)
        if resolved:
            candidates.append(Path(resolved))

    if sys.platform.startswith("win"):
        for base in (
            os.environ.get("LOCALAPPDATA"),
            os.environ.get("PROGRAMFILES"),
            os.environ.get("PROGRAMFILES(X86)"),
        ):
            if base:
                candidates.append(
                    Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe"
                )
    elif sys.platform == "darwin":
        candidates.append(
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        )

    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate.resolve()
        except OSError:
            continue

    raise BrowserBootstrapError(
        "Google Chrome could not be found. Install Chrome or set "
        "GARMIN_BROWSER_EXECUTABLE to the Chrome executable."
    )


def _profile_dir_from_args(value: Path | None) -> Path:
    if value is not None:
        return value.expanduser().absolute()
    override = os.environ.get("GARMIN_BROWSER_PROFILE", "").strip()
    if override:
        return Path(override).expanduser().absolute()
    return DEFAULT_PROFILE_DIR.expanduser().absolute()


def _launch_uncontrolled_chrome(chrome: Path, profile_dir: Path) -> None:
    """Open normal Chrome without Playwright/CDP during credential entry."""
    profile_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        profile_dir.chmod(0o700)

    command = [
        str(chrome),
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        GARMIN_ACCOUNT_ENTRY_URL,
    ]
    try:
        subprocess.Popen(
            command,
            close_fds=not sys.platform.startswith("win"),
        )
    except OSError as exc:
        raise BrowserBootstrapError(
            "Google Chrome could not be opened for the manual Garmin login."
        ) from exc


def _capture_ticket_from_authenticated_profile(
    profile_dir: Path,
    timeout_seconds: float,
    *,
    playwright_factory: Callable[[], Any] | None = None,
    monotonic: Callable[[], float] = time.monotonic,
    status_callback: Callable[[str], None] = print,
) -> BrowserExchange:
    """Use the signed-in profile only for Connect SSO/ticket observation."""
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")

    factory = playwright_factory or _playwright_factory()
    capture = _BrowserCapture()
    context: Any = None

    try:
        with factory() as playwright:
            try:
                context = playwright.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    channel="chrome",
                    headless=False,
                    no_viewport=True,
                )
            except Exception as exc:
                raise BrowserBootstrapError(
                    "Chrome could not reopen the dedicated Garmin profile. Close "
                    "every Chrome window using that dedicated profile and try again."
                ) from exc

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

            open_pages = [
                candidate for candidate in context.pages if not candidate.is_closed()
            ]
            page = open_pages[-1] if open_pages else context.new_page()

            status_callback("Opening Garmin Connect with the signed-in Chrome profile.")
            try:
                page.goto(
                    GARMIN_CONNECT_ENTRY_URL,
                    wait_until="commit",
                    timeout=30_000,
                )
            except Exception as exc:
                if capture.exchange is None:
                    raise BrowserBootstrapError(
                        "Garmin Connect could not be opened with the authenticated "
                        "Chrome profile."
                    ) from exc

            deadline = monotonic() + timeout_seconds
            connect_authenticated_at: float | None = None

            while capture.exchange is None and monotonic() < deadline:
                open_pages = [
                    candidate
                    for candidate in context.pages
                    if not candidate.is_closed()
                ]
                if not open_pages:
                    if capture.browser_authenticated:
                        raise _authenticated_without_exchange_error(capture)
                    raise BrowserBootstrapError(
                        "The Chrome window closed before Garmin Connect SSO completed."
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
                        raise _authenticated_without_exchange_error(capture)

                try:
                    open_pages[-1].wait_for_timeout(100)
                except Exception as exc:
                    if capture.exchange is not None:
                        break
                    raise BrowserBootstrapError(
                        "The Chrome session ended before an exchangeable Garmin "
                        "service ticket was captured."
                    ) from exc

            if capture.exchange is None:
                if capture.browser_authenticated:
                    raise _authenticated_without_exchange_error(capture)
                raise BrowserBootstrapError(
                    "Garmin Connect did not expose an exchangeable service ticket "
                    "before the browser timeout."
                )
            return capture.exchange
    finally:
        if context is not None:
            with contextlib.suppress(Exception):
                context.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Sign into Garmin in normal Chrome, then bootstrap reusable "
            "python-garminconnect tokens from the same dedicated profile."
        )
    )
    parser.add_argument(
        "--token-store",
        type=Path,
        help=(
            "Token directory or .json path. Defaults to GARMIN_TOKEN_STORE or "
            "~/.trainvault/garmin."
        ),
    )
    parser.add_argument(
        "--profile-dir",
        type=Path,
        help=(
            "Dedicated Chrome profile directory. Defaults to "
            "GARMIN_BROWSER_PROFILE or ~/.trainvault/garmin-browser-profile."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=_positive_timeout,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Seconds allowed for Connect SSO capture (default: 600).",
    )
    args = parser.parse_args()

    token_store_path = (
        args.token_store.expanduser()
        if args.token_store is not None
        else token_store_path_from_env(load_environment_file=False)
    )
    profile_dir = _profile_dir_from_args(args.profile_dir)
    settings = Settings(
        email=None,
        password=None,
        token_store_path=token_store_path,
    )

    try:
        chrome = _find_chrome_executable()
        print("Opening a normal Google Chrome window with a dedicated Garmin profile.")
        print(f"Dedicated profile: {profile_dir}")
        print("Sign into Garmin normally in that Chrome window.")
        print("Your credentials stay inside Garmin/Chrome and are not read by Python.")
        _launch_uncontrolled_chrome(chrome, profile_dir)

        input(
            "\nWhen Garmin Account shows you as signed in, CLOSE that dedicated "
            "Chrome window, then press Enter here to continue..."
        )

        print("Reopening the signed-in profile for Garmin Connect ticket capture.")
        exchange = _capture_ticket_from_authenticated_profile(
            profile_dir,
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
    print(
        "The dedicated Chrome profile is only a bootstrap aid; normal bridge "
        "startup now uses the saved Garmin token store."
    )


if __name__ == "__main__":
    main()
