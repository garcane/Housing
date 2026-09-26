"""Cleaning and scoping rules, lifted from main.ipynb so the notebook and the API agree.

Each function mirrors a notebook section; section numbers are noted in the docstrings.
"""
import re

import numpy as np
import pandas as pd

# ---- Outcomes (notebook section 2) -------------------------------------------------------------
APPROVED = {"Permitted", "Conditions"}
OUTCOME_MAP = {
    "Permitted": "Approved", "Conditions": "Approved",
    "Rejected": "Rejected", "Withdrawn": "Withdrawn",
    "Undecided": "Undecided", "Unresolved": "Undecided", "Referred": "Undecided",
}
MIN_DECIDED = 100  # rankings only include authorities with at least this many decided full applications

# ---- Authorities ------------------------------------------------------------------------------
# Dataset `area_name` -> ONS borough name (LAD23NM)
NAME_FIX = {"City": "City of London", "Kensington": "Kensington and Chelsea",
            "Kingston": "Kingston upon Thames", "Richmond": "Richmond upon Thames"}
# The three authorities that aren't London boroughs (notebook section 1)
OTHER_AUTHORITIES = {
    "City": "City of London",
    "Old Oak Park Royal": "Old Oak and Park Royal Development Corporation",
    "London Legacy": "London Legacy Development Corporation",
}


def display_name(area_name: str) -> str:
    return OTHER_AUTHORITIES.get(area_name) or NAME_FIX.get(area_name, area_name)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ---- Statistics -------------------------------------------------------------------------------
def wilson_ci(k, n, z=1.96):
    """95% Wilson score interval for a binomial proportion."""
    k = np.asarray(k, dtype=float)
    n = np.asarray(n, dtype=float)
    with np.errstate(invalid="ignore", divide="ignore"):
        p = k / n
        denom = 1 + z ** 2 / n
        centre = (p + z ** 2 / (2 * n)) / denom
        half = z * np.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2)) / denom
    return centre - half, centre + half


def decision_route(x):
    """Collapse ~200 free-text 'decided_by' values into a decision route."""
    if pd.isna(x):
        return "Unknown"
    s = str(x).lower()
    if "committee" in s or "members" in s:
        return "Committee"
    if "deleg" in s:
        return "Delegated"
    return "Other"


def full_applications(data: pd.DataFrame) -> pd.DataFrame:
    """Section 2: full applications with a consistent outcome, decision route and decision time.

    `days` is days_to_decision with negative values (data errors) removed. `in_time` uses the
    statutory period (91 days for Large, 56 otherwise) and ignores agreed extensions.
    """
    full = data[data["app_type"] == "Full"].copy()
    full["outcome"] = full["status"].map(OUTCOME_MAP).fillna("Unknown")
    full["start_date"] = pd.to_datetime(full["start_date"])
    full["decided_date"] = pd.to_datetime(full["decided_date"])
    full["start_year"] = full["start_date"].dt.year
    full["start_q"] = full["start_date"].dt.to_period("Q").astype(str)
    full["route"] = full["decided_by"].map(decision_route)
    full["days"] = full["days_to_decision"].where(full["days_to_decision"] >= 0)
    full["stat_days"] = np.where(full["app_size"] == "Large", 91, 56)
    full["in_time"] = (full["days"] <= full["stat_days"]).astype(float).where(full["days"].notna())
    full["decided"] = full["outcome"].isin(["Approved", "Rejected"])
    full["approved"] = full["outcome"] == "Approved"
    return full


# ---- Dwellings (notebook section 9) -----------------------------------------------------------
NOT_A_PERMISSION = "|".join([
    r"pursuant to condition", r"discharge of condition", r"details of .{0,80}condition", r"submission of details",
    r"compliance with condition", r"approval of details",
    r"non[- ]material amendment", r"minor[- ]material amendment", r"variation of condition", r"removal of condition",
    r"section 73", r"s\.?73", r"amendments? to planning permission",
    r"consultation from", r"neighbouring authority", r"adjoining (?:borough|authority)",
    r"scoping opinion", r"screening opinion",
])
# Responses to a neighbouring borough's consultation (e.g. Greenwich "Raise No Objection" on a Barking scheme)
CONSULTATION_REPLY = r"objection|observation|adjoining borough|adjoing borough|consultation"


def dwelling_schemes(data: pd.DataFrame) -> pd.DataFrame:
    """Distinct housing schemes: Full/Outline rows with a dwelling count, minus derivative
    submissions (condition discharges, amendments, consultation replies), de-duplicated by
    dwelling count + location (3 d.p. ~ 100 m), or by description when there are no coordinates."""
    raw = data[data["app_type"].isin(["Full", "Outline"]) & data["n_dwellings"].notna()].copy()
    is_derivative = (raw["description"].str.lower().str.contains(NOT_A_PERMISSION, regex=True, na=False)
                     | raw["decision"].str.contains(CONSULTATION_REPLY, case=False, regex=True, na=False))
    raw = raw[~is_derivative]
    raw["approved"] = raw["status"].isin(APPROVED)
    raw["scheme_key"] = np.where(
        raw["lat"].notna(),
        raw["n_dwellings"].astype(int).astype(str) + "|" + raw["lat"].round(3).astype(str) + "|"
        + raw["lng"].round(3).astype(str),
        raw["area_name"] + "|" + raw["n_dwellings"].astype(int).astype(str) + "|" + raw["description"].str[:60],
    )
    raw = raw.sort_values(["approved", "start_date"], ascending=[False, False])  # approved record first
    return raw.groupby("scheme_key").agg(
        n_dwellings=("n_dwellings", "first"), approved=("approved", "any"), applications=("uid", "size"),
        area_name=("area_name", "first"), app_type=("app_type", "first"), start_date=("start_date", "first"),
        description=("description", "first"), lat=("lat", "first"), lng=("lng", "first"),
        url=("url", "first"), uid=("uid", "first"),
    ).reset_index()


# ---- Land (notebook section 10) ---------------------------------------------------------------
BROWNFIELD_STATUS = {"permissioned": "Permissioned", "Planning Permission": "Permissioned", "completed": "Permissioned",
                     "not-permissioned": "Not permissioned", "non-permissioned": "Not permissioned",
                     "pending-decision": "Pending decision"}
OSM_LAND_TYPE = {"industrial": "Industrial", "farmland": "Virgin / greenfield",
                 "meadow": "Virgin / greenfield", "greenfield": "Virgin / greenfield"}
LAND_ORDER = ["Existing urban", "Brownfield", "Industrial", "Virgin / greenfield"]
