from app.main import app
from app.operations import router as operations_router

app.include_router(operations_router)

__all__ = ["app"]
