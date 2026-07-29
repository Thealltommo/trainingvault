"""Safe service errors that never expose Garmin response bodies or secrets."""

from __future__ import annotations


class GarminBridgeError(RuntimeError):
    """Base error returned by the bridge."""

    status_code = 502
    code = "garmin_upstream_error"
    public_message = "Garmin Connect is currently unavailable."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.public_message)


class GarminAuthenticationRequired(GarminBridgeError):
    """No usable token or non-interactive credentials are available."""

    status_code = 503
    code = "garmin_authentication_required"
    public_message = (
        "Garmin authentication is required. Run "
        "'python -m app.browser_login' to create or refresh the token store."
    )


class GarminRateLimited(GarminBridgeError):
    """Garmin refused the request because of rate limiting."""

    status_code = 429
    code = "garmin_rate_limited"
    public_message = "Garmin Connect is rate limiting requests. Try again later."


class GarminUpstreamUnavailable(GarminBridgeError):
    """The upstream client failed without a safe user-facing detail."""

    status_code = 502
    code = "garmin_upstream_unavailable"
    public_message = "Garmin Connect could not complete the request."


class GarminInvalidResponse(GarminBridgeError):
    """Garmin returned a successful but unusable response."""

    status_code = 502
    code = "garmin_invalid_response"
    public_message = "Garmin Connect returned an incomplete response."


class GarminInvalidRequest(GarminBridgeError):
    """A normalized request cannot be represented safely for Garmin."""

    status_code = 422
    code = "garmin_invalid_request"
    public_message = "The Garmin request is invalid."


class GarminBridgeUnauthorized(GarminBridgeError):
    """The caller did not provide the configured bridge token."""

    status_code = 401
    code = "garmin_bridge_unauthorized"
    public_message = "A valid Garmin bridge API token is required."
