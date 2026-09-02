"""Parse stored industry preferences and match job text to backgrounds."""

from __future__ import annotations

KNOWN_INDUSTRIES = (
    "Any",
    "Technology",
    "Finance",
    "Commerce / Retail",
    "BPO / Customer Support",
    "Sales",
    "Operations / HR",
)

INDUSTRY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Technology": (
        "software",
        "developer",
        "programmer",
        "sde",
        "devops",
        "frontend",
        "backend",
        "full stack",
        "fullstack",
        "python",
        "java ",
        "react",
        "data scientist",
        "data engineer",
        "machine learning",
        "ml engineer",
        "ai engineer",
        "cloud",
        "qa engineer",
        "mobile engineer",
        "ios",
        "android",
        "cybersecurity",
        "it support",
    ),
    "Finance": (
        "account",
        "finance",
        "auditor",
        "audit",
        "ca ",
        "gst",
        "tally",
        "bookkeep",
        "tax",
        "chartered",
        "financial analyst",
        "accounts payable",
        "accounts receivable",
        "payroll",
        "banking",
        "investment",
    ),
    "Commerce / Retail": (
        "retail",
        "store manager",
        "merchandis",
        "inventory",
        "e-commerce",
        "ecommerce",
        "shopify",
        "billing executive",
        "cashier",
        "warehouse",
        "purchase",
        "procurement",
        "supply chain",
        "fmcg",
    ),
    "BPO / Customer Support": (
        "bpo",
        "customer support",
        "customer service",
        "call center",
        "call centre",
        "voice process",
        "non voice",
        "chat support",
        "helpdesk",
        "help desk",
        "technical support",
        "kpo",
        "tele caller",
        "telecaller",
    ),
    "Sales": (
        "sales",
        "business development",
        "bdm",
        "bde",
        "inside sales",
        "field sales",
        "account executive",
        "lead generation",
        "relationship manager",
        "pre-sales",
        "presales",
    ),
    "Operations / HR": (
        "human resource",
        "hr executive",
        "recruiter",
        "talent acquisition",
        "operations executive",
        "admin executive",
        "office coordinator",
        "people operations",
        "l&d",
        "payroll hr",
    ),
}

DEFAULT_ROLES: dict[str, tuple[str, ...]] = {
    "Technology": ("Software Engineer", "Data Analyst"),
    "Finance": ("Accountant", "Financial Analyst"),
    "Commerce / Retail": ("Sales Executive", "Store Manager"),
    "BPO / Customer Support": ("Customer Support Executive", "Voice Process Associate"),
    "Sales": ("Sales Executive", "Business Development Executive"),
    "Operations / HR": ("HR Executive", "Operations Executive"),
}


def parse_industries(raw: object) -> list[str]:
    if raw is None:
        return ["Any"]
    if isinstance(raw, (list, tuple, set)):
        parts = [str(item).strip() for item in raw if str(item).strip()]
    else:
        text = str(raw).strip()
        if not text:
            return ["Any"]
        parts = [part.strip() for part in text.split(",") if part.strip()]
    known = set(KNOWN_INDUSTRIES)
    parts = [part for part in parts if part in known]
    if "Any" in parts and len(parts) > 1:
        parts = [part for part in parts if part != "Any"]
    return list(dict.fromkeys(parts)) or ["Any"]


def serialize_industries(industries: list[str]) -> str:
    parsed = parse_industries(industries)
    return ",".join(parsed)


def collect_industries(prefs: list) -> list[str]:
    values: list[str] = []
    for pref in prefs:
        values.extend(parse_industries(getattr(pref, "industry", None)))
    return parse_industries(values)


def default_roles_for_industries(industries: list[str]) -> list[str]:
    parsed = parse_industries(industries)
    if "Any" in parsed:
        parsed = [name for name in KNOWN_INDUSTRIES if name != "Any"]
    roles: list[str] = []
    for name in parsed:
        roles.extend(DEFAULT_ROLES.get(name, ()))
    return list(dict.fromkeys(roles))


def job_matches_industries(title: str, description: str | None, industries: list[str]) -> bool:
    parsed = parse_industries(industries)
    if not parsed or "Any" in parsed:
        return True
    blob = f"{title} {description or ''}".lower()
    for name in parsed:
        if any(keyword in blob for keyword in INDUSTRY_KEYWORDS.get(name, ())):
            return True
    return False
