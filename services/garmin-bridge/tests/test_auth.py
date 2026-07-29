from pathlib import Path

import pytest
from garminconnect.exceptions import GarminConnectAuthenticationError

from app.auth import GarminClientProvider, LocalTokenStore
from app.config import Settings
from app.errors import GarminAuthenticationRequired


class _TokenClient:
    def __init__(self) -> None:
        self.dumped_to: str | None = None
        self.skip_strategies: set[str] = set()

    def dump(self, path: str) -> None:
        self.dumped_to = path


class _FakeGarmin:
    last_instance: "_FakeGarmin | None" = None
    login_error: Exception | None = None

    def __init__(
        self,
        email: str | None,
        password: str | None,
        *,
        prompt_mfa,
    ) -> None:
        self.email = email
        self.password = password
        self.prompt_mfa = prompt_mfa
        self.client = _TokenClient()
        self.logged_in_with: str | None = None
        _FakeGarmin.last_instance = self

    def login(self, source: str) -> None:
        if self.login_error:
            raise self.login_error
        self.logged_in_with = source


def _settings(path: Path) -> Settings:
    return Settings(
        email="athlete@example.test",
        password="do-not-log",
        token_store_path=path,
    )


def test_local_token_store_is_used_and_credentials_are_not_repr(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path / "tokens")
    provider = GarminClientProvider(
        settings,
        LocalTokenStore(settings.token_store_path),
        client_type=_FakeGarmin,  # type: ignore[arg-type]
    )

    first = provider.get_client()
    second = provider.get_client()
    fake = _FakeGarmin.last_instance

    assert first is second
    assert fake is not None
    assert fake.logged_in_with == str((tmp_path / "tokens").resolve())
    assert fake.client.dumped_to == str((tmp_path / "tokens").resolve())
    assert fake.client.skip_strategies == {
        "mobile+cffi",
        "mobile+requests",
    }
    assert "do-not-log" not in repr(settings)
    assert "athlete@example.test" not in repr(settings)


def test_authentication_errors_are_redacted(tmp_path: Path) -> None:
    _FakeGarmin.login_error = GarminConnectAuthenticationError(
        "response mentioned private@example.test"
    )
    provider = GarminClientProvider(
        _settings(tmp_path / "tokens"),
        LocalTokenStore(tmp_path / "tokens"),
        client_type=_FakeGarmin,  # type: ignore[arg-type]
    )

    try:
        with pytest.raises(GarminAuthenticationRequired) as raised:
            provider.get_client()
        assert "private@example.test" not in raised.value.public_message
    finally:
        _FakeGarmin.login_error = None
