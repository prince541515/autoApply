from .base import ApplyResult, BasePortalAdapter, ScrapedJob
from .indeed import IndeedAdapter
from .linkedin import LinkedInAdapter
from .naukri import NaukriAdapter
from .wellfound import WellfoundAdapter

_ADAPTERS: dict[str, type[BasePortalAdapter]] = {
    "linkedin": LinkedInAdapter,
    "naukri": NaukriAdapter,
    "indeed": IndeedAdapter,
    "wellfound": WellfoundAdapter,
}


def get_adapter(portal_name: str) -> BasePortalAdapter:
    """Return an instantiated adapter for the given portal name.

    Raises ``ValueError`` if the portal is not supported.
    """
    cls = _ADAPTERS.get(portal_name.lower())
    if cls is None:
        supported = ", ".join(sorted(_ADAPTERS))
        raise ValueError(
            f"Unsupported portal '{portal_name}'. Supported: {supported}"
        )
    return cls()


__all__ = [
    "ApplyResult",
    "BasePortalAdapter",
    "IndeedAdapter",
    "LinkedInAdapter",
    "NaukriAdapter",
    "ScrapedJob",
    "WellfoundAdapter",
    "get_adapter",
]
