"""Rule-based recommendation engine.

For each complaint issue it combines three measurable signals into a transparent
priority score, attaches a curated recommendation from backend/data/recommendation_rules.json,
and lists the evidence. Every output is labelled as a *recommendation for
investigation*: complaint frequency does not prove why a problem occurs.

Scoring (points are defined in the rules file, so they can be changed without code):
  volume    - share of all complaints                          (max 40)
  trend     - share rising between two periods                 (max 35)
  sentiment - negative share above the dataset average         (max 25)
A signal that cannot be measured (too little date range, no narratives, tiny sample)
scores nothing and is listed as "not assessed"; the tier is based on raw points, so an
issue needs at least two signals to reach High.
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import pandas as pd

from . import analysis as an

RULES_PATH = Path(__file__).resolve().parent / "data" / "recommendation_rules.json"
RULE_FIELDS = ["id", "title", "context", "recommended_actions", "reason",
               "priority_criteria", "evidence_and_assumptions", "follow_up_metrics"]
LIST_FIELDS = ["recommended_actions", "evidence_and_assumptions", "follow_up_metrics"]


class RulesError(ValueError):
    """The rules file is malformed."""


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", str(name).strip().lower())


# --------------------------------------------------------------------------
# Loading + validation
# --------------------------------------------------------------------------
def validate_rules(doc: dict) -> None:
    for key in ("priority_config", "rules", "product_fallbacks", "generic_fallback", "label"):
        if key not in doc:
            raise RulesError(f"Rules file is missing '{key}'.")
    ids, seen_issue = set(), {}
    def check_rule(r: dict, kind: str):
        for f in RULE_FIELDS:
            if f not in r or r[f] in ("", [], None):
                raise RulesError(f"{kind} '{r.get('id', '?')}' is missing field '{f}'.")
        for f in LIST_FIELDS:
            if not isinstance(r[f], list):
                raise RulesError(f"{kind} '{r['id']}': '{f}' must be a list.")
        if r["id"] in ids:
            raise RulesError(f"Duplicate rule id '{r['id']}'.")
        ids.add(r["id"])
    for r in doc["rules"]:
        check_rule(r, "Rule")
        m = r.get("match", {})
        if not m.get("issues") and not m.get("issue_patterns"):
            raise RulesError(f"Rule '{r['id']}' matches nothing (needs issues or issue_patterns).")
        for name in m.get("issues", []):
            k = _norm(name)
            if k in seen_issue:
                raise RulesError(f"Issue '{name}' is claimed by both '{seen_issue[k]}' and '{r['id']}' "
                                 "(or listed twice). Each issue name may belong to one rule only.")
            seen_issue[k] = r["id"]
        for pat in m.get("issue_patterns", []):
            try:
                re.compile(pat)
            except re.error as exc:
                raise RulesError(f"Rule '{r['id']}' has an invalid pattern {pat!r}: {exc}") from exc
    for r in doc["product_fallbacks"]:
        check_rule(r, "Fallback")
        for pat in r.get("match_products", []):
            try:
                re.compile(pat)
            except re.error as exc:
                raise RulesError(f"Fallback '{r['id']}' has an invalid pattern {pat!r}: {exc}") from exc
    check_rule(doc["generic_fallback"], "Generic fallback")
    cfg = doc["priority_config"]
    for sig in ("volume", "trend", "sentiment"):
        if sig not in cfg or "max_points" not in cfg[sig]:
            raise RulesError(f"priority_config.{sig}.max_points is required.")
    tiers = cfg.get("tiers", [])
    if not tiers:
        raise RulesError("priority_config.tiers is required.")
    if [t["min_score"] for t in tiers] != sorted((t["min_score"] for t in tiers), reverse=True):
        raise RulesError("priority_config.tiers must be ordered from highest min_score to lowest.")
    if tiers[-1]["min_score"] != 0:
        raise RulesError("priority_config.tiers must end with a tier whose min_score is 0.")


class RuleSet:
    def __init__(self, doc: dict):
        validate_rules(doc)
        self.doc = doc
        self.config = doc["priority_config"]
        self.rules = {r["id"]: r for r in doc["rules"]}
        self._exact = {_norm(i): r for r in doc["rules"] for i in r["match"].get("issues", [])}
        self._patterns = [(re.compile(p), r) for r in doc["rules"] for p in r["match"].get("issue_patterns", [])]
        self._fallbacks = [(re.compile(p), r) for r in doc["product_fallbacks"] for p in r.get("match_products", [])]
        self.generic = doc["generic_fallback"]

    def match(self, issue: str, product: str | None = None) -> tuple[dict, str]:
        """Return (rule, match_type). Order: exact issue name > issue pattern > product fallback > generic."""
        r = self._exact.get(_norm(issue))
        if r:
            return r, "issue"
        for pat, r in self._patterns:
            if pat.search(str(issue)):
                return r, "pattern"
        if product:
            for pat, r in self._fallbacks:
                if pat.search(str(product)):
                    return r, "product_fallback"
        return self.generic, "generic"


@lru_cache(maxsize=1)
def load_rules(path: str | None = None) -> RuleSet:
    p = Path(path) if path else RULES_PATH
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RulesError(f"Rules file not found: {p}") from exc
    except json.JSONDecodeError as exc:
        raise RulesError(f"Rules file is not valid JSON: {exc}") from exc
    return RuleSet(doc)


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------
def _band(value: float, bands: list[dict], key: str) -> int:
    for b in sorted(bands, key=lambda b: b[key], reverse=True):
        if value >= b[key]:
            return int(b["points"])
    return 0


def score_issue(cfg: dict, share_pct: float, count: int, trend: dict | None,
                sentiment: dict | None, overall_negative_pct: float | None) -> dict:
    """Return the score with a per-signal breakdown. `None` inputs mean 'not assessed'."""
    parts = []
    v = cfg["volume"]
    pts = _band(share_pct, v["bands"], "min_share_pct") if count >= v.get("min_count", 0) else 0
    parts.append({"signal": "volume", "assessed": True, "points": pts, "max": v["max_points"],
                  "detail": f"{count:,} complaints = {share_pct:.2f}% of all complaints"})
    t = cfg["trend"]
    if trend is None:
        parts.append({"signal": "trend", "assessed": False, "points": 0, "max": t["max_points"],
                      "detail": "Not assessed: not enough dated data to compare two periods"})
    else:
        if trend["meaningful"] and trend["direction"] == "up":
            tp, d = t["meaningful_rise_points"], "Share rose meaningfully"
        elif trend["direction"] == "up":
            tp, d = t["any_rise_points"], "Share rose slightly (not statistically and practically meaningful)"
        elif trend["meaningful"] and trend["direction"] == "down":
            tp, d = 0, "Share fell meaningfully"
        else:
            tp, d = 0, "No meaningful change in share"
        parts.append({"signal": "trend", "assessed": True, "points": tp, "max": t["max_points"],
                      "detail": f"{d}: {trend['share_prev_pct']:.2f}% to {trend['share_recent_pct']:.2f}% of complaints"})
    s = cfg["sentiment"]
    if sentiment is None or overall_negative_pct is None:
        parts.append({"signal": "sentiment", "assessed": False, "points": 0, "max": s["max_points"],
                      "detail": f"Not assessed: needs sentiment results and at least {s['min_analysed']} narratives for this issue"})
    else:
        gap = sentiment["negative_pct"] - overall_negative_pct
        sp = _band(gap, s["bands"], "min_pp_above_overall")
        parts.append({"signal": "sentiment", "assessed": True, "points": sp, "max": s["max_points"],
                      "detail": f"{sentiment['negative_pct']:.1f}% of {sentiment['analysed']:,} narratives score negative "
                                f"({gap:+.1f} points vs overall {overall_negative_pct:.1f}%)"})
    total = sum(p["points"] for p in parts)
    tier = next(t["name"] for t in cfg["tiers"] if total >= t["min_score"])
    return {"total": total, "max_possible": sum(p["max"] for p in parts),
            "signals_assessed": sum(p["assessed"] for p in parts), "tier": tier, "breakdown": parts}


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------
LIMITATIONS = [
    "Complaint frequency shows where customers are complaining, not why. These are recommendations to investigate, not confirmed root causes.",
    "Correlation is not causation: an issue that rises alongside another is not necessarily its cause.",
    "Complaint volumes are not rates: without customer or account counts, bigger businesses naturally get more complaints.",
    "Sentiment is a rough text-based estimate and only covers complaints that include a narrative.",
    "The same complaint type can appear under several names (for example after category renames); variants are listed so you can see combined volume.",
]


def _why(item: dict) -> list[str]:
    out = [f"Ranks #{item['volume_rank']} by volume: {item['count']:,} complaints ({item['share_pct']:.2f}% of all complaints)."]
    tr = item["trend"]
    if tr is None:
        out.append("Trend was not assessed because the data does not span enough complete months.")
    elif tr["meaningful"]:
        word = "rose" if tr["direction"] == "up" else "fell"
        out.append(f"Its share of complaints {word} from {tr['share_prev_pct']:.2f}% to {tr['share_recent_pct']:.2f}% "
                   f"when comparing {tr['period_prev']} with {tr['period_recent']} (a meaningful change).")
    else:
        out.append("Its share of complaints did not change meaningfully between the two periods compared.")
    se = item["sentiment"]
    if se:
        out.append(f"{se['negative_pct']:.1f}% of its narratives score negative ({se['vs_overall_pp']:+.1f} points vs the dataset average; VADER estimate).")
    if item["products"]:
        p = item["products"][0]
        out.append(f"Most come from {p['name']} ({p['pct']:.0f}% of this issue's complaints).")
    si = item["sub_issues"]
    if si["available"] and si["items"]:
        out.append(f"Most common sub-issue: {si['items'][0]['name']} ({si['items'][0]['pct']:.0f}% of those with a sub-issue; "
                   f"{si['missing_pct']:.0f}% have none recorded).")
    return out


def build_report(df: pd.DataFrame, filters: an.Filters | None = None, top_n: int = 10,
                 rules: RuleSet | None = None, window_months: int = 12) -> dict:
    """Prioritised recommendations for the (optionally filtered) dataset."""
    rules = rules or load_rules()
    cfg = rules.config
    d = an.apply_filters(df, filters)
    total = int(d["issue"].notna().sum())
    if total == 0:
        return {"status": "no_data", "items": [], "themes": [], "limitations": LIMITATIONS, "label": rules.doc["label"]}

    counts = d["issue"].value_counts()
    counts = counts[counts > 0]
    # --- signals computed once for all issues
    rising = an.rising_issues(d, window_months)
    trend_map = {i["name"]: i for i in rising["items"]} if rising["status"] == "ok" else {}
    sent_map, overall_neg = {}, None
    if "sentiment" in d.columns and d["sentiment"].notna().any():
        from . import sentiment as sm
        n_an = int(d["sentiment"].notna().sum())
        overall_neg = 100 * int((d["sentiment"] == "Negative").sum()) / n_an
        min_an = cfg["sentiment"]["min_analysed"]
        sent_map = {r["name"]: r for r in sm.by_category(d, "issue", min_n=min_an, top=10**6)}

    candidates = []
    for name, cnt in counts.items():
        name = str(name)
        share = 100 * cnt / total
        tr = trend_map.get(name)
        if rising["status"] == "ok" and tr is None:        # issue absent in both windows
            tr = {"meaningful": False, "direction": "flat", "share_prev_pct": 0.0, "share_recent_pct": 0.0}
        se = sent_map.get(name)
        if se is not None:
            se = dict(se, vs_overall_pp=round(se["negative_pct"] - overall_neg, 2))
        sc = score_issue(cfg, share, int(cnt), tr, se, overall_neg)
        candidates.append((name, int(cnt), share, tr, se, sc))
    vol_rank = {c[0]: i + 1 for i, c in enumerate(candidates)}      # counts are already sorted desc
    candidates.sort(key=lambda c: (-c[5]["total"], -c[1]))

    items = []
    for rank, (name, cnt, share, tr, se, sc) in enumerate(candidates[:top_n], 1):
        sub = d[d["issue"] == name]
        prods = an.top_counts(sub, "product", 5)
        dominant = prods[0]["name"] if prods else None
        rule, mtype = rules.match(name, dominant)
        variants = [{"name": str(n), "count": int(c)} for n, c in counts.items()
                    if str(n) != name and rules.match(str(n))[0]["id"] == rule["id"]
                    and rules.match(str(n))[1] in ("issue", "pattern")] if mtype in ("issue", "pattern") else []
        item = {"rank": rank, "issue": name, "count": cnt, "share_pct": round(share, 3), "volume_rank": vol_rank[name],
                "score": sc, "tier": sc["tier"], "products": prods,
                "sub_issues": an.sub_issues_for_issue(sub, name, 5) if "sub_issue" in sub.columns
                              else {"available": False, "items": [], "missing_pct": None},
                "trend": None if tr is None else dict(tr, period_prev=" to ".join(rising["period_prev"]) if rising["status"] == "ok" else None,
                                                      period_recent=" to ".join(rising["period_recent"]) if rising["status"] == "ok" else None),
                "sentiment": se,
                "same_theme_variants": variants,
                "recommendation": {"rule_id": rule["id"], "title": rule["title"], "match_type": mtype,
                                   "specific": mtype in ("issue", "pattern"),
                                   "label": rules.doc["label"], "context": rule["context"],
                                   "actions": rule["recommended_actions"], "reason": rule["reason"],
                                   "priority_criteria": rule["priority_criteria"],
                                   "evidence_and_assumptions": rule["evidence_and_assumptions"],
                                   "follow_up_metrics": rule["follow_up_metrics"]}}
        item["why_highlighted"] = _why(item)
        items.append(item)

    return {"status": "ok", "label": rules.doc["label"], "disclaimer": rules.doc["disclaimer"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "rules_version": rules.doc["rules_version"],
            "dataset": {"complaints": total, "issues": int(len(counts)),
                        "sentiment_available": bool(sent_map)},
            "trend_status": {"status": rising["status"], "reason": rising.get("reason"),
                             "period_prev": rising.get("period_prev"), "period_recent": rising.get("period_recent"),
                             "volume_change_pct": rising.get("volume_change_pct")},
            "method": {"signals": {k: cfg[k]["max_points"] for k in ("volume", "trend", "sentiment")},
                       "tiers": cfg["tiers"],
                       "note": "Points are earned per signal; the tier uses raw points, so an issue needs at least two assessed signals to reach High."},
            "coverage": rule_coverage(counts, rules),
            "themes": theme_summary(counts, rules),
            "items": items, "limitations": LIMITATIONS}


def rule_coverage(counts: pd.Series, rules: RuleSet) -> dict:
    """Share of complaints whose issue has an issue-specific rule (vs fallback)."""
    tot = int(counts.sum())
    by = {"issue": 0, "pattern": 0, "other": 0}
    unmatched = []
    for name, c in counts.items():
        _, mt = rules.match(str(name))
        if mt in by:
            by[mt] += int(c)
        else:
            by["other"] += int(c)
            unmatched.append({"issue": str(name), "count": int(c)})
    spec = by["issue"] + by["pattern"]
    return {"specific_rule_pct": round(100 * spec / tot, 2) if tot else 0.0,
            "exact_match_pct": round(100 * by["issue"] / tot, 2) if tot else 0.0,
            "pattern_match_pct": round(100 * by["pattern"] / tot, 2) if tot else 0.0,
            "fallback_only_pct": round(100 * by["other"] / tot, 2) if tot else 0.0,
            "unmatched_issues": unmatched[:25]}


def theme_summary(counts: pd.Series, rules: RuleSet, top: int = 10) -> list[dict]:
    """Combine issue-name variants that share a rule into one theme with total volume."""
    tot = int(counts.sum())
    agg: dict[str, dict] = {}
    for name, c in counts.items():
        rule, mt = rules.match(str(name))
        if mt not in ("issue", "pattern"):
            continue
        a = agg.setdefault(rule["id"], {"rule_id": rule["id"], "title": rule["title"], "count": 0, "issues": []})
        a["count"] += int(c)
        a["issues"].append({"name": str(name), "count": int(c)})
    out = sorted(agg.values(), key=lambda x: -x["count"])[:top]
    for a in out:
        a["share_pct"] = round(100 * a["count"] / tot, 2)
    return out


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def to_csv(report: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "issue", "priority", "score", "complaints", "share_pct", "trend", "negative_pct",
                "rule", "rule_match", "recommended_actions", "reason", "follow_up_metrics", "label"])
    for it in report["items"]:
        tr = it["trend"]
        trend = "not assessed" if tr is None else (f"{tr['direction']} (meaningful)" if tr["meaningful"] else "no meaningful change")
        rec = it["recommendation"]
        w.writerow([it["rank"], it["issue"], it["tier"], it["score"]["total"], it["count"], it["share_pct"], trend,
                    "" if not it["sentiment"] else it["sentiment"]["negative_pct"],
                    rec["title"], rec["match_type"], " | ".join(rec["actions"]), rec["reason"],
                    " | ".join(rec["follow_up_metrics"]), rec["label"]])
    return buf.getvalue()


def to_markdown(report: dict) -> str:
    L = ["# Complaint investigation priorities", "", f"*{report['label']}*", "", report["disclaimer"], ""]
    d = report["dataset"]
    L += [f"Based on {d['complaints']:,} complaints across {d['issues']} issues. "
          f"Rules version {report['rules_version']}.", ""]
    for it in report["items"]:
        rec = it["recommendation"]
        L += [f"## {it['rank']}. {it['issue']}  [{it['tier']} priority, score {it['score']['total']}]", "",
              "**Why this is highlighted**"] + [f"- {w}" for w in it["why_highlighted"]]
        L += ["", "**Score breakdown**"] + [f"- {b['signal'].title()}: {b['points']}/{b['max']} - {b['detail']}" for b in it["score"]["breakdown"]]
        kind = "" if rec["specific"] else " (general guidance - no issue-specific rule)"
        L += ["", f"**{rec['title']}**{kind}", "", rec["context"], "", "Suggested actions to investigate:"]
        L += [f"- {a}" for a in rec["actions"]]
        L += ["", f"Reason: {rec['reason']}", f"Priority guidance: {rec['priority_criteria']}", "", "Evidence and assumptions:"]
        L += [f"- {e}" for e in rec["evidence_and_assumptions"]]
        L += ["", "Follow-up measures:"] + [f"- {m}" for m in rec["follow_up_metrics"]] + [""]
    L += ["## Limitations"] + [f"- {x}" for x in report["limitations"]]
    return "\n".join(L)
