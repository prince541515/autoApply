"""Job matching engine — scores (candidate, job) pairs and queues applications."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.preference import JobPreference
from app.models.user import User

logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.5

WEIGHTS = {
    "role": 0.30,
    "skills": 0.25,
    "location": 0.20,
    "salary": 0.15,
    "experience": 0.10,
}


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9#+.]+", text.lower()))


def score_role_match(job_title: str, preferred_roles: list[str]) -> float:
    if not preferred_roles:
        return 0.0
    title_tokens = _tokenize(job_title)
    best = 0.0
    for role in preferred_roles:
        role_tokens = _tokenize(role)
        if not role_tokens:
            continue
        overlap = len(title_tokens & role_tokens)
        score = overlap / len(role_tokens)
        best = max(best, score)
    return min(best, 1.0)


def score_skills_match(job_description: str, required_skills: list[str]) -> float:
    if not required_skills:
        return 0.5
    desc_lower = job_description.lower()
    hits = sum(1 for skill in required_skills if skill.lower() in desc_lower)
    return hits / len(required_skills)


def score_location_match(job_location: str | None, preferred_locations: list[str]) -> float:
    if not preferred_locations:
        return 0.0
    from app.services.location_filter import job_matches_location

    if job_matches_location(job_location, preferred_locations):
        return 1.0
    if job_location and "remote" in job_location.lower():
        return 0.6
    return 0.0


def score_salary_match(
    job_min: int | None,
    job_max: int | None,
    pref_min: int | None,
    pref_max: int | None,
) -> float:
    if job_min is None and job_max is None:
        return 0.5  # no info — neutral
    if pref_min is None and pref_max is None:
        return 0.5
    j_lo = job_min or 0
    j_hi = job_max or j_lo
    p_lo = pref_min or 0
    p_hi = pref_max or p_lo
    if j_hi < p_lo:
        return 0.0
    if j_lo > p_hi:
        return 0.3  # above range might still be interesting
    return 1.0


def score_experience_match(
    job_title: str,
    job_description: str,
    pref_min_exp: int | None,
    pref_max_exp: int | None,
) -> float:
    from app.services.experience_filter import job_experience_years, job_fits_experience

    if pref_min_exp is None and pref_max_exp is None:
        return 0.5
    if not job_fits_experience(job_title, job_description, pref_min_exp, pref_max_exp):
        return 0.0
    required = job_experience_years(job_title, job_description)
    if required is None:
        return 0.5
    return 1.0


def calculate_overall_score(scores: dict[str, float]) -> float:
    return sum(scores.get(k, 0.0) * w for k, w in WEIGHTS.items())


def flatten_preferences(
    prefs: list[JobPreference], extra_skills: list | None = None
) -> dict:
    """Collect preference fields once so scoring does not re-walk rows per job."""
    preferred_roles: list[str] = []
    preferred_locations: list[str] = []
    required_skills: list[str] = []
    pref_min_salary: int | None = None
    pref_max_salary: int | None = None
    pref_min_exp: int | None = None
    pref_max_exp: int | None = None

    for pref in prefs:
        if isinstance(pref.roles, list):
            preferred_roles.extend(pref.roles)
        if isinstance(pref.locations, list):
            preferred_locations.extend(pref.locations)
        if isinstance(pref.required_skills, list):
            required_skills.extend(pref.required_skills)
        if pref.min_salary is not None:
            pref_min_salary = (
                pref.min_salary if pref_min_salary is None else min(pref_min_salary, pref.min_salary)
            )
        if pref.max_salary is not None:
            pref_max_salary = (
                pref.max_salary if pref_max_salary is None else max(pref_max_salary, pref.max_salary)
            )
        if pref.min_experience_years is not None:
            pref_min_exp = (
                pref.min_experience_years
                if pref_min_exp is None
                else min(pref_min_exp, pref.min_experience_years)
            )
        if pref.max_experience_years is not None:
            pref_max_exp = (
                pref.max_experience_years
                if pref_max_exp is None
                else max(pref_max_exp, pref.max_experience_years)
            )

    if extra_skills:
        for skill in extra_skills:
            if isinstance(skill, str) and skill.strip():
                required_skills.append(skill.strip())

    return {
        "roles": preferred_roles,
        "locations": preferred_locations,
        "skills": list(dict.fromkeys(required_skills)),
        "min_salary": pref_min_salary,
        "max_salary": pref_max_salary,
        "min_exp": pref_min_exp,
        "max_exp": pref_max_exp,
    }


def score_job_with_flat_prefs(
    job: JobListing, flat: dict, *, use_description: bool = True
) -> float:
    description = ""
    if use_description:
        description = job.description or ""
    scores = {
        "role": score_role_match(job.title, flat["roles"]),
        "skills": score_skills_match(description, flat["skills"]) if description else 0.5,
        "location": score_location_match(job.location, flat["locations"]),
        "salary": score_salary_match(
            job.salary_min, job.salary_max, flat["min_salary"], flat["max_salary"]
        ),
        "experience": score_experience_match(
            job.title, description, flat["min_exp"], flat["max_exp"]
        ),
    }
    return calculate_overall_score(scores)


def score_job_against_preferences(
    job: JobListing, prefs: list[JobPreference], extra_skills: list | None = None
) -> float:
    """Score a listing against one candidate's preference rows."""
    return score_job_with_flat_prefs(job, flatten_preferences(prefs, extra_skills))


def match_jobs_to_candidates(
    jobs: list[JobListing],
    db: Session,
) -> list[tuple[str, str, float]]:
    """Return list of (candidate_id, job_id, score) for matches above threshold."""

    candidates = (
        db.execute(
            select(CandidateProfile)
            .join(User, User.id == CandidateProfile.user_id)
            .where(
                CandidateProfile.auto_apply_enabled.is_(True),
                CandidateProfile.auto_apply_allowed.is_(True),
                User.account_status == "active",
                User.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )

    results: list[tuple[str, str, float]] = []

    for candidate in candidates:
        prefs_result = db.execute(
            select(JobPreference).where(JobPreference.candidate_id == candidate.id)
        )
        prefs = prefs_result.scalars().all()

        preferred_roles: list[str] = []
        preferred_locations: list[str] = []
        required_skills: list[str] = []
        pref_min_salary: int | None = None
        pref_max_salary: int | None = None
        pref_min_exp: int | None = None
        pref_max_exp: int | None = None

        for p in prefs:
            if p.roles:
                preferred_roles.extend(p.roles if isinstance(p.roles, list) else [])
            if p.locations:
                preferred_locations.extend(p.locations if isinstance(p.locations, list) else [])
            if p.required_skills:
                required_skills.extend(
                    p.required_skills if isinstance(p.required_skills, list) else []
                )
            if p.min_salary is not None:
                pref_min_salary = (
                    min(pref_min_salary, p.min_salary)
                    if pref_min_salary is not None
                    else p.min_salary
                )
            if p.max_salary is not None:
                pref_max_salary = (
                    max(pref_max_salary, p.max_salary)
                    if pref_max_salary is not None
                    else p.max_salary
                )
            if p.min_experience_years is not None:
                pref_min_exp = (
                    min(pref_min_exp, p.min_experience_years)
                    if pref_min_exp is not None
                    else p.min_experience_years
                )
            if p.max_experience_years is not None:
                pref_max_exp = (
                    max(pref_max_exp, p.max_experience_years)
                    if pref_max_exp is not None
                    else p.max_experience_years
                )

        if candidate.skills and isinstance(candidate.skills, list):
            required_skills.extend(
                s for s in candidate.skills if isinstance(s, str) and s.strip()
            )
        required_skills = list(dict.fromkeys(required_skills))

        from app.services.experience_filter import job_fits_experience

        for job in jobs:
            if str(getattr(job, "candidate_id", "") or "") != str(candidate.id):
                continue
            if not job_fits_experience(
                job.title, job.description or "", pref_min_exp, pref_max_exp
            ):
                continue
            scores = {
                "role": score_role_match(job.title, preferred_roles),
                "skills": score_skills_match(job.description or "", required_skills),
                "location": score_location_match(job.location, preferred_locations),
                "salary": score_salary_match(
                    job.salary_min, job.salary_max, pref_min_salary, pref_max_salary
                ),
                "experience": score_experience_match(
                    job.title, job.description or "", pref_min_exp, pref_max_exp
                ),
            }
            overall = calculate_overall_score(scores)

            if overall >= MATCH_THRESHOLD:
                results.append((str(candidate.id), str(job.id), overall))

    return results


def create_applications_for_matches(
    matches: list[tuple[str, str, float]],
    db: Session,
    portal_lookup: dict[str, str],
) -> list[Application]:
    """Create Application records for each match and return the created applications."""
    created: list[Application] = []

    for candidate_id, job_id, _score in matches:
        existing = db.execute(
            select(Application).where(
                Application.candidate_id == candidate_id,
                Application.job_id == job_id,
            )
        ).scalar_one_or_none()

        if existing:
            continue

        portal = portal_lookup.get(job_id, "unknown")
        app = Application(
            candidate_id=candidate_id,
            job_id=job_id,
            status="queued",
            portal=portal,
        )
        db.add(app)
        created.append(app)

    db.commit()
    for app in created:
        db.refresh(app)

    return created
