from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def to_async_database_url(url: str) -> str:
    value = url.strip()
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://") :]
    if value.startswith("postgresql://") and "+asyncpg" not in value:
        value = "postgresql+asyncpg://" + value[len("postgresql://") :]
    return _strip_libpq_ssl_params(value)


def to_sync_database_url(url: str) -> str:
    value = to_async_database_url(url).replace("postgresql+asyncpg://", "postgresql://", 1)
    return value


def _strip_libpq_ssl_params(url: str) -> str:
    parts = urlsplit(url)
    kept = [(key, val) for key, val in parse_qsl(parts.query) if key.lower() not in {"sslmode", "ssl"}]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))


def database_needs_ssl(url: str) -> bool:
    lowered = url.lower()
    return (
        "sslmode=require" in lowered
        or "ssl=true" in lowered
        or "proxy.rlwy.net" in lowered
        or "-pooler." in lowered
    )
