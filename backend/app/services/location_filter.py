"""Strict location matching for scrape queries and the jobs list."""

from __future__ import annotations

from app.models.job import JobListing
from app.models.preference import JobPreference
from app.services.job_matcher import score_role_match
from app.services.portal_adapters.base import ScrapedJob
from app.services.industry import collect_industries, job_matches_industries

STATE_ALIASES: dict[str, set[str]] = {
    "karnataka": {"bangalore", "bengaluru", "mysore", "mysuru", "mangalore"},
    "maharashtra": {"mumbai", "pune", "nagpur", "navi mumbai", "thane"},
    "telangana": {"hyderabad", "secunderabad"},
    "tamil nadu": {"chennai", "coimbatore", "madurai"},
    "delhi": {"new delhi", "ncr", "delhi ncr"},
    "haryana": {"gurgaon", "gurugram"},
    "uttar pradesh": {"noida", "greater noida", "lucknow"},
    "west bengal": {"kolkata", "calcutta"},
    "gujarat": {"ahmedabad", "surat", "vadodara"},
    "rajasthan": {"jaipur"},
    "kerala": {"kochi", "cochin", "trivandrum", "thiruvananthapuram"},
    "california": {"san francisco", "sf", "bay area", "los angeles", "palo alto"},
    "new york": {"nyc", "new york city", "brooklyn", "manhattan"},
    "washington": {"seattle", "bellevue", "redmond"},
    "texas": {"austin", "dallas", "houston"},
}

COUNTRIES = {
    "india",
    "united states",
    "usa",
    "uk",
    "united kingdom",
    "canada",
    "germany",
    "singapore",
    "united arab emirates",
    "uae",
    "australia",
    "netherlands",
}

INDIA_REGIONS = {
    "karnataka",
    "maharashtra",
    "telangana",
    "tamil nadu",
    "delhi",
    "haryana",
    "uttar pradesh",
    "west bengal",
    "gujarat",
    "rajasthan",
    "kerala",
    "andhra pradesh",
    "punjab",
    "madhya pradesh",
}


def _geo_locations(locations: list[str]) -> list[str]:
    return [loc for loc in locations if loc.strip().lower() != "remote"]


def collect_preference_locations(prefs: list[JobPreference]) -> list[str]:
    values: list[str] = []
    for pref in prefs:
        if isinstance(pref.locations, list):
            values.extend(str(item) for item in pref.locations if item)
    return values


def job_matches_location(
    job_location: str | None,
    preferred_locations: list[str],
    work_mode: str | None = None,
) -> bool:
    if not preferred_locations:
        return True

    allow_remote = any(loc.lower() == "remote" for loc in preferred_locations)
    mode = (work_mode or "Any").strip().lower()
    if mode == "remote":
        allow_remote = True
    job_loc = (job_location or "").strip()
    job_lower = job_loc.lower()
    is_remote = "remote" in job_lower

    if mode == "remote":
        if is_remote or not job_loc:
            return True
        # Still accept on-site/hybrid roles in the preferred country.
    if mode == "on-site" and is_remote and "hybrid" not in job_lower:
        return False
    if allow_remote and is_remote:
        return True

    geos = _geo_locations(preferred_locations)
    if not geos:
        return allow_remote

    for loc in geos:
        parts = [part.strip().lower() for part in loc.split(",") if part.strip()]
        if not parts:
            continue
        region = parts[0]
        country = parts[-1]
        aliases = STATE_ALIASES.get(region, set())
        if len(parts) == 1:
            if country in COUNTRIES:
                if country in job_lower:
                    return True
                if country == "india":
                    india_cities = {
                        city
                        for region_name, cities in STATE_ALIASES.items()
                        if region_name in INDIA_REGIONS
                        for city in cities
                    }
                    if any(city in job_lower for city in india_cities) or any(
                        region_name in job_lower for region_name in INDIA_REGIONS
                    ):
                        return True
                continue
            if region in job_lower or any(alias in job_lower for alias in aliases):
                return True
            continue
        if region in job_lower or any(alias in job_lower for alias in aliases):
            return True
        if country in job_lower and region in COUNTRIES:
            return True
    return False


def build_preference_filter(prefs: list[JobPreference]) -> dict:
    roles: list[str] = []
    locations: list[str] = []
    excluded: list[str] = []
    work_mode: str | None = None
    min_exp: int | None = None
    max_exp: int | None = None
    for pref in prefs:
        if isinstance(pref.roles, list):
            roles.extend(str(role) for role in pref.roles if role)
        if isinstance(pref.locations, list):
            locations.extend(str(loc) for loc in pref.locations if loc)
        if isinstance(pref.excluded_companies, list):
            excluded.extend(str(name) for name in pref.excluded_companies if name)
        if pref.work_mode:
            work_mode = pref.work_mode
        if pref.min_experience_years is not None:
            min_exp = (
                pref.min_experience_years
                if min_exp is None
                else min(min_exp, pref.min_experience_years)
            )
        if pref.max_experience_years is not None:
            max_exp = (
                pref.max_experience_years
                if max_exp is None
                else max(max_exp, pref.max_experience_years)
            )
    return {
        "roles": roles,
        "locations": locations,
        "excluded": [name.lower() for name in excluded],
        "work_mode": work_mode,
        "min_exp": min_exp,
        "max_exp": max_exp,
        "industries": collect_industries(prefs),
    }


def job_matches_pref_filter(job: JobListing | ScrapedJob, filt: dict) -> bool:
    industries = filt.get("industries") or []
    description = getattr(job, "description", None)
    if not job_matches_industries(job.title, description, industries):
        return False
    roles = filt.get("roles") or []
    if roles and (not industries or "Any" in industries):
        if score_role_match(job.title, roles) < 0.2:
            return False
    excluded = filt.get("excluded") or []
    if excluded:
        company = (job.company or "").lower()
        if any(name in company for name in excluded):
            return False
    from app.services.experience_filter import job_matches_experience

    if not job_matches_experience(job, filt.get("min_exp"), filt.get("max_exp")):
        return False
    return job_matches_location(job.location, filt.get("locations") or [], filt.get("work_mode"))


def job_matches_preferences(job: JobListing | ScrapedJob, prefs: list[JobPreference]) -> bool:
    return job_matches_pref_filter(job, build_preference_filter(prefs))


def search_locations_from_prefs(prefs: list[JobPreference]) -> list[str]:
    locations = collect_preference_locations(prefs)
    return _geo_locations(locations)
