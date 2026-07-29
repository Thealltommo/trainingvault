from __future__ import annotations

import json
from pathlib import Path

import pytest
from garminconnect import Garmin

import app.browser_login as browser_login_module
from app.auth import LocalTokenStore
from app.browser_login import (
    GARMIN_CONNECT_ENTRY_URL,
    BrowserBootstrapError,
    _BrowserCapture,
    _capture_auth_response,
    _exchange_from_connect_navigation,
    _observe_authenticated_connect_context,
    _observe_response,
    _route_without_consuming_ticket,
    bootstrap_token_store,
    capture_service_ticket,
    exchange_browser_ticket,
)
from app.config import Settings

CURRENT_CONNECT_SERVICE = "https://connect.garmin.com/app/"


def _auth_response_url(path: str = "/portal/api/checkLogin") -> str:
    return f"https://sso.garmin.com{path}"


class _Request:
    def __init__(self, url: str = "", method: str = "POST") -> None:
        self.url = url
        self.method = method


class _Response:
    def __init__(
        self,
        payload: object,
        *,
        url: str | None = None,
        method: str = "POST",
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.url = url or _auth_response_url()
        self.request = _Request(method=method)
        self.status = status
        self.headers = headers or {}
        self._payload = payload

    def json(self) -> object:
        return self._payload


class _Route:
    def __init__(self, url: str) -> None:
        self.request = _Request(url=url, method="GET")
        self.aborted = False
        self.continued = False

    def abort(self) -> None:
        self.aborted = True

    def continue_(self) -> None:
        self.continued = True


@pytest.mark.parametrize(
    ("response_path", "method"),
    [
        ("/portal/api/checkLogin", "GET"),
        ("/portal/api/login", "POST"),
        ("/portal/api/mfa/verifyCode", "POST"),
    ],
)
def test_capture_accepts_current_success_shape_from_trusted_auth_paths(
    response_path: str,
    method: str,
) -> None:
    capture = _BrowserCapture()
    statuses: list[str] = []
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-browser-ticket-123",
                "serviceURL": CURRENT_CONNECT_SERVICE,
            },
            url=_auth_response_url(response_path),
            method=method,
        ),
        capture,
        statuses.append,
    )

    assert capture.exchange is not None
    assert capture.exchange.ticket == "ST-browser-ticket-123"
    assert capture.exchange.service_url == CURRENT_CONNECT_SERVICE
    assert capture.browser_authenticated is True
    assert statuses == [
        "Browser authenticated.",
        "Garmin ticket/session captured.",
    ]


def test_capture_rejects_a_matching_response_from_another_host() -> None:
    rejected = _BrowserCapture()
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-evil-ticket",
                "serviceURL": CURRENT_CONNECT_SERVICE,
            },
            url="https://evil.example/portal/api/login",
        ),
        rejected,
    )
    assert rejected.exchange is None
    assert rejected.browser_authenticated is False


def test_capture_rejects_suffix_confusion_service_url() -> None:
    capture = _BrowserCapture()
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-wrong-service-ticket",
                "serviceURL": "https://connect.garmin.com.evil.example/app/",
            }
        ),
        capture,
    )

    assert capture.exchange is None
    assert capture.browser_authenticated is False


def test_success_without_a_valid_service_is_not_an_authentication_signal() -> None:
    capture = _BrowserCapture()
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-unscoped-ticket",
            }
        ),
        capture,
    )

    assert capture.exchange is None
    assert capture.browser_authenticated is False


def test_capture_uses_first_valid_service_candidate_and_decodes_once() -> None:
    capture = _BrowserCapture()
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-encoded-service-ticket",
                "serviceURL": "https://connect.garmin.com.evil.example/app/",
                "serviceUrl": (
                    "https%3A%2F%2Fconnect.garmin.com%2Fapp%2F"
                ),
            }
        ),
        capture,
    )

    assert capture.exchange is not None
    assert capture.exchange.ticket == "ST-encoded-service-ticket"
    assert capture.exchange.service_url == CURRENT_CONNECT_SERVICE


def test_capture_prefers_exact_request_service_over_normalized_payload() -> None:
    capture = _BrowserCapture()
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-query-service-ticket",
                "serviceURL": "https://connect.garmin.com/app",
            },
            url=(
                f"{_auth_response_url()}"
                "?service=https%3A%2F%2Fconnect.garmin.com%2Fapp%2F"
            ),
        ),
        capture,
    )

    assert capture.exchange is not None
    assert capture.exchange.service_url == CURRENT_CONNECT_SERVICE


def test_login_required_response_is_not_an_authentication_signal() -> None:
    capture = _BrowserCapture()
    _capture_auth_response(
        _Response(
            {
                "responseStatus": {"type": "LOGIN_REQUIRED"},
                "serviceURL": None,
            },
            method="GET",
        ),
        capture,
    )

    assert capture.browser_authenticated is False
    assert capture.exchange is None


def test_connect_navigation_preserves_exact_service_and_is_not_consumed() -> None:
    capture = _BrowserCapture()
    final_route = _Route(
        "https://connect.garmin.com/app/?source=current"
        "&ticket=ST-navigation-ticket-456"
    )
    unrelated_capture = _BrowserCapture()
    unrelated_route = _Route("https://connect.garmin.com/app/")

    _route_without_consuming_ticket(final_route, capture)
    _route_without_consuming_ticket(unrelated_route, unrelated_capture)

    assert capture.exchange is not None
    assert capture.exchange.ticket == "ST-navigation-ticket-456"
    assert capture.exchange.service_url == (
        "https://connect.garmin.com/app/?source=current"
    )
    assert final_route.aborted is True
    assert final_route.continued is False
    assert unrelated_route.aborted is False
    assert unrelated_route.continued is True


def test_connect_navigation_replaces_normalized_service_for_same_ticket() -> None:
    capture = _BrowserCapture()
    capture.accept(
        "ST-authoritative-service-ticket",
        "https://connect.garmin.com/app",
        lambda _message: None,
    )
    final_route = _Route(
        "https://connect.garmin.com/app/"
        "?ticket=ST-authoritative-service-ticket"
    )

    _route_without_consuming_ticket(final_route, capture)

    assert capture.exchange is not None
    assert capture.exchange.service_url == CURRENT_CONNECT_SERVICE
    assert final_route.aborted is True


def test_response_location_can_capture_current_connect_ticket() -> None:
    capture = _BrowserCapture()
    _observe_response(
        _Response(
            {},
            status=302,
            headers={
                "location": (
                    "https://connect.garmin.com/app/"
                    "?ticket=ST-location-ticket"
                )
            },
        ),
        capture,
    )

    assert capture.exchange is not None
    assert capture.exchange.ticket == "ST-location-ticket"
    assert capture.exchange.service_url == CURRENT_CONNECT_SERVICE


def test_response_location_from_untrusted_host_is_ignored() -> None:
    capture = _BrowserCapture()
    _observe_response(
        _Response(
            {},
            url="https://evil.example/redirect",
            status=302,
            headers={
                "location": (
                    "https://connect.garmin.com/app/"
                    "?ticket=ST-untrusted-location"
                )
            },
        ),
        capture,
    )

    assert capture.exchange is None
    assert capture.browser_authenticated is False


@pytest.mark.parametrize(
    "url",
    [
        "http://connect.garmin.com/app/?ticket=ST-http",
        "https://connect.garmin.com.evil.example/app/?ticket=ST-evil",
        "https://evil.example/app/?ticket=ST-evil",
        "https://connect.garmin.com/app/?ticket=not-a-ticket",
    ],
)
def test_ticket_navigation_rejects_untrusted_or_malformed_urls(
    url: str,
) -> None:
    assert _exchange_from_connect_navigation(url) is None


class _FakePage:
    def __init__(self, response: _Response | None) -> None:
        self.response = response
        self.goto_calls: list[tuple[str, dict[str, object]]] = []
        self.closed = False
        self.context: _FakeContext | None = None
        self.wait_error: Exception | None = None
        self.url = "about:blank"

    def goto(self, url: str, **kwargs: object) -> None:
        self.goto_calls.append((url, kwargs))
        self.url = url

    def is_closed(self) -> bool:
        return self.closed

    def wait_for_timeout(self, _milliseconds: int) -> None:
        if self.wait_error is not None:
            error = self.wait_error
            self.wait_error = None
            self.closed = True
            raise error
        if self.response is not None:
            assert self.context is not None
            callback = self.context.callbacks["response"]
            assert callable(callback)
            callback(self.response)
            self.response = None


class _FakeContext:
    def __init__(self, page: _FakePage) -> None:
        self.page = page
        self.route_pattern: str | None = None
        self.route_callback: object = None
        self.callbacks: dict[str, object] = {}
        self.closed = False
        self.pages = [page]
        self.cookie_state: list[dict[str, object]] = []
        page.context = self

    def route(self, pattern: str, callback: object) -> None:
        self.route_pattern = pattern
        self.route_callback = callback

    def new_page(self) -> _FakePage:
        return self.page

    def on(self, event: str, callback: object) -> None:
        self.callbacks[event] = callback

    def cookies(self, _urls: list[str]) -> list[dict[str, object]]:
        return self.cookie_state

    def close(self) -> None:
        self.closed = True


class _FakeBrowser:
    def __init__(self, context: _FakeContext) -> None:
        self.context = context
        self.new_context_kwargs: dict[str, object] | None = None
        self.closed = False

    def new_context(self, **kwargs: object) -> _FakeContext:
        self.new_context_kwargs = kwargs
        return self.context

    def close(self) -> None:
        self.closed = True


class _FakeChromium:
    def __init__(self, browser: _FakeBrowser) -> None:
        self.browser = browser
        self.launch_kwargs: dict[str, object] | None = None

    def launch(self, **kwargs: object) -> _FakeBrowser:
        self.launch_kwargs = kwargs
        return self.browser


class _FakePlaywright:
    def __init__(self, chromium: _FakeChromium) -> None:
        self.chromium = chromium


class _FakePlaywrightManager:
    def __init__(self, playwright: _FakePlaywright) -> None:
        self.playwright = playwright

    def __enter__(self) -> _FakePlaywright:
        return self.playwright

    def __exit__(self, *_args: object) -> None:
        return None


def _fake_browser_stack(
    response: _Response | None,
) -> tuple[
    _FakePlaywrightManager,
    _FakeChromium,
    _FakeBrowser,
    _FakeContext,
    _FakePage,
]:
    page = _FakePage(response)
    context = _FakeContext(page)
    browser = _FakeBrowser(context)
    chromium = _FakeChromium(browser)
    manager = _FakePlaywrightManager(_FakePlaywright(chromium))
    return manager, chromium, browser, context, page


def test_browser_capture_is_headed_ephemeral_and_closes() -> None:
    manager, chromium, browser, context, page = _fake_browser_stack(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-playwright-ticket-789",
                "serviceURL": CURRENT_CONNECT_SERVICE,
            }
        )
    )
    statuses: list[str] = []

    exchange = capture_service_ticket(
        1,
        playwright_factory=lambda: manager,
        status_callback=statuses.append,
    )

    assert exchange.ticket == "ST-playwright-ticket-789"
    assert exchange.service_url == CURRENT_CONNECT_SERVICE
    assert chromium.launch_kwargs == {"headless": False}
    assert browser.new_context_kwargs == {}
    assert context.route_pattern == "https://connect.garmin.com/**"
    assert page.goto_calls[0][0] == GARMIN_CONNECT_ENTRY_URL
    assert all("/portal/" not in call[0] for call in page.goto_calls)
    assert page.goto_calls[0][1] == {
        "wait_until": "commit",
        "timeout": 30_000,
    }
    assert statuses == [
        "Browser authenticated.",
        "Garmin ticket/session captured.",
    ]
    assert context.closed is True
    assert browser.closed is True


def test_browser_closes_when_user_closes_login_page() -> None:
    manager, _chromium, browser, context, page = _fake_browser_stack(None)
    page.closed = True

    with pytest.raises(BrowserBootstrapError, match="closed"):
        capture_service_ticket(
            1,
            playwright_factory=lambda: manager,
        )

    assert context.closed is True
    assert browser.closed is True


def test_browser_continues_when_a_step_up_popup_closes() -> None:
    manager, _chromium, browser, context, page = _fake_browser_stack(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-after-popup-ticket",
                "serviceURL": CURRENT_CONNECT_SERVICE,
            }
        )
    )
    popup = _FakePage(None)
    popup.context = context
    popup.wait_error = RuntimeError("popup closed")
    context.pages.append(popup)

    exchange = capture_service_ticket(
        1,
        playwright_factory=lambda: manager,
    )

    assert exchange.ticket == "ST-after-popup-ticket"
    assert exchange.service_url == CURRENT_CONNECT_SERVICE
    assert context.closed is True
    assert browser.closed is True


def test_authenticated_connect_cookie_without_ticket_fails_closed() -> None:
    manager, _chromium, browser, context, page = _fake_browser_stack(None)
    context.cookie_state = [
        {
            "name": "JWT_WEB",
            "value": "must-not-be-logged",
            "domain": ".connect.garmin.com",
        }
    ]
    statuses: list[str] = []
    clock_values = iter([0.0, 0.1, 0.2, 0.3, 5.3])

    with pytest.raises(
        BrowserBootstrapError,
        match="cookies cannot be promoted",
    ) as raised:
        capture_service_ticket(
            10,
            playwright_factory=lambda: manager,
            monotonic=lambda: next(clock_values),
            status_callback=statuses.append,
        )

    assert "must-not-be-logged" not in str(raised.value)
    assert statuses == ["Browser authenticated."]
    assert context.closed is True
    assert browser.closed is True


def test_parent_domain_cookie_and_connect_deep_link_prove_authentication() -> None:
    page = _FakePage(None)
    page.url = "https://connect.garmin.com/app/home"
    context = _FakeContext(page)
    context.cookie_state = [
        {
            "name": "JWT_WEB",
            "value": "parent-domain-session",
            "domain": ".garmin.com",
        }
    ]
    capture = _BrowserCapture()

    _observe_authenticated_connect_context(
        context,
        [page],
        capture,
        lambda _message: None,
    )

    assert capture.browser_authenticated is True
    assert capture.connect_authenticated is True


def test_authenticated_context_gets_grace_to_capture_queued_ticket() -> None:
    manager, _chromium, _browser, context, _page = _fake_browser_stack(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-after-auth-proof",
                "serviceURL": CURRENT_CONNECT_SERVICE,
            }
        )
    )
    context.cookie_state = [
        {
            "name": "JWT_WEB",
            "value": "must-not-be-logged",
            "domain": ".garmin.com",
        }
    ]
    statuses: list[str] = []

    exchange = capture_service_ticket(
        1,
        playwright_factory=lambda: manager,
        status_callback=statuses.append,
    )

    assert exchange.ticket == "ST-after-auth-proof"
    assert exchange.service_url == CURRENT_CONNECT_SERVICE
    assert statuses == [
        "Browser authenticated.",
        "Garmin ticket/session captured.",
    ]


def test_cloudflare_cookies_do_not_prove_authentication() -> None:
    page = _FakePage(None)
    page.url = GARMIN_CONNECT_ENTRY_URL
    context = _FakeContext(page)
    context.cookie_state = [
        {
            "name": "__cf_bm",
            "value": "anonymous",
            "domain": ".connect.garmin.com",
        },
        {
            "name": "SESSION",
            "value": "also-not-proof",
            "domain": ".sso.garmin.com",
        },
    ]
    capture = _BrowserCapture()

    _observe_authenticated_connect_context(
        context,
        [page],
        capture,
        lambda _message: None,
    )

    assert capture.browser_authenticated is False
    assert capture.connect_authenticated is False


def test_current_user_success_proves_browser_auth_but_not_exchangeability() -> None:
    capture = _BrowserCapture()
    statuses: list[str] = []

    _observe_response(
        _Response(
            {"userId": "not-inspected"},
            url=(
                "https://connect.garmin.com"
                "/app/currentuser-service/user/info"
            ),
            status=200,
        ),
        capture,
        statuses.append,
    )

    assert capture.browser_authenticated is True
    assert capture.connect_authenticated is True
    assert capture.exchange is None
    assert statuses == ["Browser authenticated."]


@pytest.mark.parametrize("payload", [{}, [], "not-json"])
def test_empty_or_non_object_current_user_response_is_not_authentication(
    payload: object,
) -> None:
    capture = _BrowserCapture()
    _observe_response(
        _Response(
            payload,
            url=(
                "https://connect.garmin.com"
                "/app/currentuser-service/user/info"
            ),
            status=200,
        ),
        capture,
    )

    assert capture.browser_authenticated is False
    assert capture.connect_authenticated is False


def test_account_auth_uses_public_connect_entry_at_most_once() -> None:
    manager, _chromium, _browser, _context, page = _fake_browser_stack(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-account-ticket",
                "serviceURL": "https://www.garmin.com/account/",
            }
        )
    )
    clock_values = iter([0.0, 0.1, 0.2, 2.0])

    with pytest.raises(BrowserBootstrapError, match="authentication succeeded"):
        capture_service_ticket(
            1,
            playwright_factory=lambda: manager,
            monotonic=lambda: next(clock_values),
        )

    assert [call[0] for call in page.goto_calls] == [
        GARMIN_CONNECT_ENTRY_URL,
        GARMIN_CONNECT_ENTRY_URL,
    ]
    assert all("/portal/" not in call[0] for call in page.goto_calls)


def test_account_navigation_error_does_not_discard_captured_ticket() -> None:
    manager, _chromium, _browser, context, page = _fake_browser_stack(
        _Response(
            {
                "responseStatus": {"type": "SUCCESSFUL"},
                "serviceTicketId": "ST-account-service",
                "serviceURL": "https://www.garmin.com/account/",
            }
        )
    )
    original_goto = page.goto

    def goto_with_ticket(url: str, **kwargs: object) -> None:
        original_goto(url, **kwargs)
        if len(page.goto_calls) == 2:
            callback = context.route_callback
            assert callable(callback)
            callback(
                _Route(
                    "https://connect.garmin.com/app/"
                    "?ticket=ST-account-to-connect"
                )
            )
            raise RuntimeError("ticket navigation was intentionally aborted")

    page.goto = goto_with_ticket  # type: ignore[method-assign]
    clock_values = iter([0.0, 0.1, 0.2])

    exchange = capture_service_ticket(
        1,
        playwright_factory=lambda: manager,
        monotonic=lambda: next(clock_values),
    )

    assert exchange.ticket == "ST-account-to-connect"
    assert exchange.service_url == CURRENT_CONNECT_SERVICE


class _NativeClient:
    def __init__(
        self,
        events: list[str],
        *,
        profile: object | None = None,
    ) -> None:
        self.events = events
        self.profile = (
            profile if profile is not None else {"displayName": "athlete"}
        )
        self.di_token: str | None = None
        self.di_refresh_token: str | None = None
        self.di_client_id: str | None = None
        self.service_url: str | None = None

    def _exchange_service_ticket(
        self,
        _ticket: str,
        *,
        service_url: str,
    ) -> None:
        self.events.append("exchange")
        self.service_url = service_url
        self.di_token = "fake-access"
        self.di_refresh_token = "fake-refresh"
        self.di_client_id = "fake-client"

    def connectapi(self, path: str) -> object:
        assert path == "/userprofile-service/socialProfile"
        self.events.append("verify")
        return self.profile


class _DumpingNativeClient(_NativeClient):
    def dump(self, path: str) -> None:
        self.events.append("persist")
        serializer = Garmin()
        serializer.client.di_token = self.di_token
        serializer.client.di_refresh_token = self.di_refresh_token
        serializer.client.di_client_id = self.di_client_id
        serializer.client.dump(path)


class _BootstrapGarmin:
    def __init__(self, native: _NativeClient) -> None:
        self.client = native

    def connectapi(self, path: str) -> object:
        return self.client.connectapi(path)


class _RestoredGarmin:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    def get_user_profile(self) -> dict[str, str]:
        self.events.append("profile")
        return {"displayName": "athlete"}

    def get_devices(self) -> list[dict[str, str]]:
        self.events.append("devices")
        return [{"displayName": "watch"}]


class _RecordingStore:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    def login_source(self) -> str:
        return "unused"

    def persist(self, _client: Garmin) -> None:
        self.events.append("persist")


class _RecordingProvider:
    def __init__(
        self,
        settings: Settings,
        restored: _RestoredGarmin,
        events: list[str],
    ) -> None:
        assert settings.email is None
        assert settings.password is None
        assert settings.interactive_auth is False
        self.restored = restored
        self.events = events

    def get_client(self) -> _RestoredGarmin:
        self.events.append("restore")
        return self.restored


def test_bootstrap_orders_exchange_verify_persist_and_token_only_restore(
    tmp_path: Path,
) -> None:
    events: list[str] = []
    native = _NativeClient(events)
    bootstrap_client = _BootstrapGarmin(native)
    restored = _RestoredGarmin(events)
    store = _RecordingStore(events)
    settings = Settings(
        email="must-not-be-forwarded@example.test",
        password="must-not-be-forwarded",
        token_store_path=tmp_path / "tokens",
        interactive_auth=True,
    )
    statuses = [
        "Opening Garmin login in a private, temporary Chromium window.",
        "Browser authenticated.",
        "Garmin ticket/session captured.",
    ]

    result = bootstrap_token_store(
        "ST-bootstrap-ticket-123",
        settings,
        service_url=CURRENT_CONNECT_SERVICE,
        client_factory=lambda: bootstrap_client,  # type: ignore[arg-type]
        token_store=store,
        provider_factory=lambda token_settings, _store: _RecordingProvider(
            token_settings,
            restored,
            events,
        ),
        status_callback=statuses.append,
    )

    assert events == [
        "exchange",
        "verify",
        "persist",
        "restore",
        "profile",
        "devices",
    ]
    assert native.service_url == CURRENT_CONNECT_SERVICE
    assert result.device_count == 1
    assert result.token_file == (
        tmp_path / "tokens" / "garmin_tokens.json"
    ).resolve()
    assert statuses == [
        "Opening Garmin login in a private, temporary Chromium window.",
        "Browser authenticated.",
        "Garmin ticket/session captured.",
        "Exchanging tokens.",
        "Verifying profile.",
        "Verifying devices.",
        "Token store promoted.",
    ]
    assert "ST-bootstrap-ticket-123" not in " ".join(statuses)


def test_failed_strict_verification_does_not_persist(tmp_path: Path) -> None:
    events: list[str] = []
    native = _NativeClient(events, profile=[])
    store = _RecordingStore(events)
    settings = Settings(
        email=None,
        password=None,
        token_store_path=tmp_path / "tokens",
    )

    with pytest.raises(BrowserBootstrapError, match="invalid profile"):
        bootstrap_token_store(
            "ST-bootstrap-ticket-456",
            settings,
            service_url=CURRENT_CONNECT_SERVICE,
            client_factory=lambda: _BootstrapGarmin(native),  # type: ignore[arg-type]
            token_store=store,
        )

    assert events == ["exchange", "verify"]


def test_local_store_is_verified_before_atomic_promotion(tmp_path: Path) -> None:
    events: list[str] = []
    native = _DumpingNativeClient(events)
    bootstrap_client = _BootstrapGarmin(native)
    restored = _RestoredGarmin(events)
    final_store = LocalTokenStore(tmp_path / "tokens")
    final_file = Path(final_store.login_source()) / "garmin_tokens.json"
    final_file.parent.mkdir(parents=True)
    final_file.write_text("previous-working-store", encoding="utf-8")
    settings = Settings(
        email="must-not-be-forwarded@example.test",
        password="must-not-be-forwarded",
        token_store_path=Path(final_store.login_source()),
        interactive_auth=True,
    )

    def provider_factory(
        token_settings: Settings,
        store: LocalTokenStore,
    ) -> _RecordingProvider:
        assert token_settings.token_store_path != settings.token_store_path
        loaded = Garmin()
        loaded.client.load(store.login_source())
        assert loaded.client.di_token == "fake-access"
        assert final_file.read_text(encoding="utf-8") == (
            "previous-working-store"
        )
        return _RecordingProvider(token_settings, restored, events)

    result = bootstrap_token_store(
        "ST-atomic-success-ticket",
        settings,
        service_url=CURRENT_CONNECT_SERVICE,
        client_factory=lambda: bootstrap_client,  # type: ignore[arg-type]
        token_store=final_store,
        provider_factory=provider_factory,  # type: ignore[arg-type]
    )

    persisted = json.loads(final_file.read_text(encoding="utf-8"))
    assert persisted == {
        "di_token": "fake-access",
        "di_refresh_token": "fake-refresh",
        "di_client_id": "fake-client",
    }
    assert result.token_file == final_file.resolve()
    assert not list(final_file.parent.glob(".trainvault-garmin-bootstrap-*"))


def test_failed_cold_restore_preserves_existing_local_store(
    tmp_path: Path,
) -> None:
    events: list[str] = []
    native = _DumpingNativeClient(events)
    bootstrap_client = _BootstrapGarmin(native)
    final_store = LocalTokenStore(tmp_path / "tokens")
    final_file = Path(final_store.login_source()) / "garmin_tokens.json"
    final_file.parent.mkdir(parents=True)
    final_file.write_text("previous-working-store", encoding="utf-8")
    settings = Settings(
        email=None,
        password=None,
        token_store_path=Path(final_store.login_source()),
    )

    class _NoDeviceGarmin(_RestoredGarmin):
        def get_devices(self) -> list[dict[str, str]]:
            self.events.append("devices")
            return []

    restored = _NoDeviceGarmin(events)

    with pytest.raises(BrowserBootstrapError, match="no registered"):
        bootstrap_token_store(
            "ST-atomic-failure-ticket",
            settings,
            service_url=CURRENT_CONNECT_SERVICE,
            client_factory=lambda: bootstrap_client,  # type: ignore[arg-type]
            token_store=final_store,
            provider_factory=lambda token_settings, _store: _RecordingProvider(
                token_settings,
                restored,
                events,
            ),
        )

    assert final_file.read_text(encoding="utf-8") == "previous-working-store"
    assert not list(final_file.parent.glob(".trainvault-garmin-bootstrap-*"))


def test_first_local_promotion_supports_an_exact_json_target(
    tmp_path: Path,
) -> None:
    events: list[str] = []
    native = _DumpingNativeClient(events)
    restored = _RestoredGarmin(events)
    token_file = tmp_path / "private" / "custom-garmin-auth.json"
    store = LocalTokenStore(token_file)
    settings = Settings(
        email=None,
        password=None,
        token_store_path=token_file,
    )

    result = bootstrap_token_store(
        "ST-exact-json-ticket",
        settings,
        service_url=CURRENT_CONNECT_SERVICE,
        client_factory=lambda: _BootstrapGarmin(native),  # type: ignore[arg-type]
        token_store=store,
        provider_factory=lambda token_settings, _store: _RecordingProvider(
            token_settings,
            restored,
            events,
        ),
    )

    assert result.token_file == token_file.absolute()
    assert json.loads(token_file.read_text(encoding="utf-8")) == {
        "di_token": "fake-access",
        "di_refresh_token": "fake-refresh",
        "di_client_id": "fake-client",
    }


def test_atomic_promotion_failure_preserves_existing_local_store(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    native = _DumpingNativeClient(events)
    restored = _RestoredGarmin(events)
    final_store = LocalTokenStore(tmp_path / "tokens")
    final_file = Path(final_store.login_source()) / "garmin_tokens.json"
    final_file.parent.mkdir(parents=True)
    final_file.write_text("previous-working-store", encoding="utf-8")
    settings = Settings(
        email=None,
        password=None,
        token_store_path=Path(final_store.login_source()),
    )

    def fail_promotion(_source: Path, _destination: Path) -> None:
        raise PermissionError("simulated locked destination")

    monkeypatch.setattr(browser_login_module.os, "replace", fail_promotion)

    with pytest.raises(BrowserBootstrapError, match="could not be persisted"):
        bootstrap_token_store(
            "ST-promotion-failure-ticket",
            settings,
            service_url=CURRENT_CONNECT_SERVICE,
            client_factory=lambda: _BootstrapGarmin(native),  # type: ignore[arg-type]
            token_store=final_store,
            provider_factory=lambda token_settings, _store: _RecordingProvider(
                token_settings,
                restored,
                events,
            ),
        )

    assert final_file.read_text(encoding="utf-8") == "previous-working-store"
    assert not list(final_file.parent.glob(".trainvault-garmin-bootstrap-*"))


def test_promotion_replaces_token_symlink_without_touching_its_target(
    tmp_path: Path,
) -> None:
    events: list[str] = []
    native = _DumpingNativeClient(events)
    restored = _RestoredGarmin(events)
    unrelated_file = tmp_path / "unrelated.json"
    unrelated_file.write_text("must-remain-unchanged", encoding="utf-8")
    token_file = tmp_path / "tokens" / "garmin_tokens.json"
    token_file.parent.mkdir(parents=True)
    try:
        token_file.symlink_to(unrelated_file)
    except OSError:
        pytest.skip("File symlinks are unavailable for this Windows user")

    store = LocalTokenStore(token_file.parent)
    settings = Settings(
        email=None,
        password=None,
        token_store_path=token_file.parent,
    )
    bootstrap_token_store(
        "ST-symlink-ticket",
        settings,
        service_url=CURRENT_CONNECT_SERVICE,
        client_factory=lambda: _BootstrapGarmin(native),  # type: ignore[arg-type]
        token_store=store,
        provider_factory=lambda token_settings, _store: _RecordingProvider(
            token_settings,
            restored,
            events,
        ),
    )

    assert unrelated_file.read_text(encoding="utf-8") == (
        "must-remain-unchanged"
    )
    assert token_file.is_symlink() is False
    assert json.loads(token_file.read_text(encoding="utf-8"))["di_token"] == (
        "fake-access"
    )


def test_exchange_fails_closed_without_refreshable_native_state() -> None:
    class _IncompleteNative:
        def _exchange_service_ticket(
            self,
            _ticket: str,
            *,
            service_url: str,
        ) -> None:
            assert service_url == CURRENT_CONNECT_SERVICE
            self.di_token = "access-only"
            self.di_refresh_token = None
            self.di_client_id = "client"

    class _IncompleteGarmin:
        client = _IncompleteNative()

    with pytest.raises(BrowserBootstrapError, match="complete refreshable"):
        exchange_browser_ticket(  # type: ignore[arg-type]
            _IncompleteGarmin(),
            "ST-incomplete-ticket",
            CURRENT_CONNECT_SERVICE,
        )


def test_restored_provider_requires_a_registered_device(tmp_path: Path) -> None:
    events: list[str] = []
    native = _NativeClient(events)
    bootstrap_client = _BootstrapGarmin(native)
    store = _RecordingStore(events)
    settings = Settings(
        email=None,
        password=None,
        token_store_path=tmp_path / "tokens",
    )

    class _NoDeviceGarmin(_RestoredGarmin):
        def get_devices(self) -> list[dict[str, str]]:
            self.events.append("devices")
            return []

    restored = _NoDeviceGarmin(events)

    with pytest.raises(BrowserBootstrapError, match="no registered"):
        bootstrap_token_store(
            "ST-no-device-ticket",
            settings,
            service_url=CURRENT_CONNECT_SERVICE,
            client_factory=lambda: bootstrap_client,  # type: ignore[arg-type]
            token_store=store,
            provider_factory=lambda token_settings, _store: _RecordingProvider(
                token_settings,
                restored,
                events,
            ),
        )


def test_upstream_token_dump_and_load_round_trip(tmp_path: Path) -> None:
    token_path = tmp_path / "tokens"
    source = Garmin()
    source.client.di_token = "placeholder-access"
    source.client.di_refresh_token = "placeholder-refresh"
    source.client.di_client_id = "placeholder-client"
    source.client.dump(str(token_path))

    persisted = json.loads(
        (token_path / "garmin_tokens.json").read_text(encoding="utf-8")
    )
    restored = Garmin()
    restored.client.load(str(token_path))

    assert set(persisted) == {
        "di_token",
        "di_refresh_token",
        "di_client_id",
    }
    assert restored.client.di_token == "placeholder-access"
    assert restored.client.di_refresh_token == "placeholder-refresh"
    assert restored.client.di_client_id == "placeholder-client"
