from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.db_urls import to_async_database_url

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _env_files() -> tuple[str, ...]:
    candidates = (_PROJECT_ROOT / ".env", _BACKEND_DIR / ".env")
    found = tuple(str(path) for path in candidates if path.is_file())
    return found or (".env",)


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/autoapply"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = ""
    UPLOAD_DIR: str = "./uploads"
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "AutoApply <noreply@doptonin.online>"
    EMAIL_REPLY_TO: str = "doptonin@gmail.com"
    ADMIN_NOTIFY_EMAIL: str = "doptonin@gmail.com"
    APP_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> str:
        return to_async_database_url(str(value))

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [item.strip().rstrip("/") for item in self.CORS_ORIGINS.split(",") if item.strip()]
        app = self.APP_URL.strip().rstrip("/")
        if app and app not in origins:
            origins.append(app)
        return origins


settings = Settings()
