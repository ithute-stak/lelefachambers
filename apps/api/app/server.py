from app.main import app
from app.operations import router as operations_router
from app.recovery import router as recovery_router
from app.automation import router as automation_router

app.include_router(operations_router)
app.include_router(recovery_router)
app.include_router(automation_router)

__all__ = ["app"]
