from fastapi import Request
from fastapi.responses import JSONResponse

from app.main import app
from app.operations import router as operations_router
from app.recovery import router as recovery_router
from app.automation import pay_config, router as automation_router


@app.middleware("http")
async def require_ithute_pay_configuration(request: Request, call_next):
    """Prevent financial create/refresh calls from producing local pseudo-attempts when Pay is disabled.

    Read-only Ithute Pay administration routes remain available so staff can inspect historical
    requests even while the external integration is intentionally disabled.
    """
    path = request.url.path
    financial_action = request.method.upper() == "POST" and (
        path.endswith("/ithute-pay/payment-request")
        or ("/ops/ithute-pay/requests/" in path and path.endswith("/refresh"))
    )
    if financial_action and (not pay_config.enabled or not pay_config.api_key):
        return JSONResponse(
            status_code=503,
            content={"detail": "Ithute Pay is not enabled/configured for this environment"},
        )
    return await call_next(request)


app.include_router(operations_router)
app.include_router(recovery_router)
app.include_router(automation_router)

__all__ = ["app"]
