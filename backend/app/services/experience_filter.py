"""Hard-filter jobs by candidate experience range using title + description."""

from __future__ import annotations

import re
from typing import Any

YEAR_RANGE = re.compile(
    r"(\d{1,2})\s*(?:[-–]|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)",
    re.IGNORECASE,
)
YEAR_PLUS = re.compile(
    r"(\d{1,2})\s*\+\s*(?:years?|yrs?)",
    re.IGNORECASE,
)
YEAR_MINIMUM = re.compile(
    r"(?:at\s+least|minimum|min\.?|must\s+have)\s+(\d{1,2})\s*(?:years?|yrs?)",
    re.IGNORECASE,
)
YEAR_OF_EXP = re.compile(
    r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp\b)",
    re.IGNORECASE,
)

ENTRY_LEVEL_TITLE = re.compile(
    r"\b(fresher|intern(ship)?|trainee|graduate|campus|entry[- ]level|"
    r"junior|jr\.?|associate)\b",
    re.I,
)

FRESHER_SEARCH_ROLES = [
    "Junior Developer",
    "Junior Engineer",
    "Junior Software Engineer",
    "Junior Software Developer",
    "Junior Frontend Developer",
    "Junior Backend Developer",
    "Associate Software Engineer",
    "Graduate Engineer Trainee",
    "Software Engineer Fresher",
    "Entry Level Software Engineer",
]


def is_entry_level_title(title: str | None) -> bool:
    return bool(title and ENTRY_LEVEL_TITLE.search(title))


def expand_roles_for_fresher(roles: list[str]) -> list[str]:
    expanded: list[str] = []
    seen: set[str] = set()

    def add(role: str) -> None:
        clean = role.strip()
        key = clean.lower()
        if not clean or key in seen:
            return
        seen.add(key)
        expanded.append(clean)

    for role in roles:
        add(role)
        lower = role.lower()
        if not lower.startswith("junior "):
            add(f"Junior {role}")
        if "engineer" in lower and "developer" not in lower:
            add(role.replace("Engineer", "Developer").replace("engineer", "developer"))
    for role in FRESHER_SEARCH_ROLES:
        add(role)
    return expanded

# Typical minimum years implied by seniority in the job title.
SENIORITY_RULES: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"\b(intern(ship)?|trainee|fresher|graduate|campus)\b", re.I), 0),
    (re.compile(r"\b(junior|jr\.?|entry[- ]level|associate)\b", re.I), 0),
    (re.compile(r"\b(mid[- ]level|intermediate)\b", re.I), 3),
    (re.compile(r"\b(senior|sr\.?)\b", re.I), 5),
    (re.compile(r"\bstaff\b", re.I), 7),
    (re.compile(r"\bprincipal\b", re.I), 8),
    (re.compile(r"\b(tech(?:nical)?\s+lead|team\s+lead|lead\s+engineer|supervisor)\b", re.I), 6),
    (re.compile(r"\barchitect\b", re.I), 7),
    (re.compile(r"\b(engineering\s+manager|assistant\s+manager|manager)\b", re.I), 6),
    (re.compile(r"\b(avp|agm|dgm|deputy\s+manager|associate\s+manager)\b", re.I), 7),
    (re.compile(r"\b(director|vp|vice\s+president|head\s+of)\b", re.I), 10),
    (re.compile(r"\b(iii|iv|4)\b"), 6),
    (re.compile(r"\bii\b"), 4),
]


def parse_required_years(*texts: str | None) -> int | None:
    """Return the highest minimum years of experience mentioned in the texts."""
    blob = " ".join(part for part in texts if part)
    if not blob:
        return None

    required = 0
    found = False
    for match in YEAR_RANGE.finditer(blob):
        found = True
        required = max(required, int(match.group(1)))
    for match in YEAR_PLUS.finditer(blob):
        found = True
        required = max(required, int(match.group(1)))
    for match in YEAR_MINIMUM.finditer(blob):
        found = True
        required = max(required, int(match.group(1)))
    for match in YEAR_OF_EXP.finditer(blob):
        found = True
        required = max(required, int(match.group(1)))
    return required if found else None


def infer_seniority_years(title: str | None) -> int | None:
    if not title:
        return None
    inferred = 0
    found = False
    for pattern, years in SENIORITY_RULES:
        if pattern.search(title):
            found = True
            inferred = max(inferred, years)
    return inferred if found else None


def job_experience_years(title: str | None, description: str | None = None) -> int | None:
    parsed = parse_required_years(title, description)
    seniority = infer_seniority_years(title)
    values = [value for value in (parsed, seniority) if value is not None]
    if not values:
        return None
    return max(values)


def job_fits_experience(
    title: str | None,
    description: str | None,
    pref_min: int | None,
    pref_max: int | None,
) -> bool:
    if pref_min is None and pref_max is None:
        return True
    required = job_experience_years(title, description)
    if required is None:
        return True
    if pref_max is not None and required > pref_max:
        return False
    if pref_min is not None and required < pref_min and infer_seniority_years(title) is not None:
        # e.g. intern role when the candidate wants 5+ years
        return False
    return True


def _safe_description(job: Any) -> str:
    try:
        from sqlalchemy import inspect as sa_inspect

        insp = sa_inspect(job, raiseerr=False)
        if insp is not None and getattr(insp, "unloaded", None) is not None:
            if "description" in insp.unloaded:
                return ""
    except Exception:
        pass
    return getattr(job, "description", None) or ""


def job_matches_experience(
    job: Any,
    pref_min: int | None,
    pref_max: int | None,
    include_fresher: bool = False,
) -> bool:
    title = getattr(job, "title", None)
    if include_fresher and is_entry_level_title(title):
        return True
    return job_fits_experience(
        title,
        _safe_description(job),
        pref_min,
        pref_max,
    )


def linkedin_experience_filter(
    pref_min: int | None,
    pref_max: int | None,
    include_fresher: bool = False,
) -> str:
    """LinkedIn f_E codes: 1 intern, 2 entry, 3 associate, 4 mid-senior."""
    if pref_min is None and pref_max is None and not include_fresher:
        return ""
    max_years = 20 if pref_max is None else pref_max
    min_years = 0 if include_fresher or pref_min is None else pref_min
    codes: list[str] = []
    if include_fresher or (min_years <= 1 and max_years >= 0):
        codes.extend(["1", "2"])
    if max_years >= 2:
        codes.append("3")
    if max_years >= 4:
        codes.append("4")
    if max_years >= 8:
        codes.append("5")
    return ",".join(dict.fromkeys(codes))


def naukri_experience_filter(
    pref_min: int | None, pref_max: int | None, include_fresher: bool = False
) -> str:
    if pref_min is None and pref_max is None and not include_fresher:
        return ""
    lo = 0 if include_fresher or pref_min is None else pref_min
    hi = 20 if pref_max is None else pref_max
    return f"{lo}-{hi}"
