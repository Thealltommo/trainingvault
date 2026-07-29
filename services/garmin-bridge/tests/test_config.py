from pathlib import Path

from app.config import Settings


def test_platform_port_is_used_when_bridge_port_is_absent(monkeypatch) -> None:
    monkeypatch.delenv("GARMIN_BRIDGE_PORT", raising=False)
    monkeypatch.setenv("PORT", "4321")
    monkeypatch.setenv("GARMIN_BRIDGE_ENV", "production")
    monkeypatch.setenv("GARMIN_TOKEN_STORE", "/data/garmin")
    monkeypatch.setenv("GARMIN_BRIDGE_API_TOKEN", "secret")
    monkeypatch.setenv("GARMIN_BRIDGE_HOST", "0.0.0.0")

    settings = Settings.from_env(load_environment_file=False)

    assert settings.port == 4321
    assert settings.production is True
    assert settings.host == "0.0.0.0"
    assert settings.token_store_path == Path("/data/garmin")


def test_explicit_bridge_port_wins_over_platform_port(monkeypatch) -> None:
    monkeypatch.setenv("GARMIN_BRIDGE_PORT", "8765")
    monkeypatch.setenv("PORT", "4321")

    settings = Settings.from_env(load_environment_file=False)

    assert settings.port == 8765
