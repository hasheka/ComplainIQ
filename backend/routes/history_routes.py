"""Saved reports (analysis history) and their export."""
from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select

from .. import analysis as an
from .. import recommendations as rc
from .. import sentiment as sm
from ..deps import DB, CurrentUser, Frame, ReadyDataset
from ..models import Analysis, Dataset
from ..schemas import AnalysisDetailOut, AnalysisOut, ReportIn

router = APIRouter(tags=["reports"])


def _filters(f) -> an.Filters:
    def d(x):
        try:
            return date.fromisoformat(x) if x else None
        except ValueError:
            raise HTTPException(422, "Dates must look like 2016-01-31.")
    if any(s not in sm.LABELS for s in f.sentiments):
        raise HTTPException(422, "sentiments must be Negative, Neutral or Positive.")
    return an.Filters(d(f.date_from), d(f.date_to), f.products or None, f.issues or None, f.sentiments or None)


def _summary_report(frame, filters: an.Filters) -> dict:
    d = an.apply_filters(frame, filters)
    out = an.dashboard_summary(d)
    out["sentiment"] = sm.distribution(d) if "sentiment" in d.columns else None
    return out


def _out(a: Analysis, name: str) -> dict:
    return {"id": a.id, "dataset_id": a.dataset_id, "dataset_name": name, "kind": a.kind, "title": a.title,
            "headline": a.headline, "filters": a.filters, "created_at": a.created_at}


@router.post("/api/datasets/{dataset_id}/reports", response_model=AnalysisDetailOut, status_code=201)
def save_report(body: ReportIn, ds: ReadyDataset, frame: Frame, user: CurrentUser, db: DB):
    """Generates a report with the chosen filters and stores it in your history so it can be reopened and exported."""
    filters = _filters(body.filters)
    if filters.sentiments and "sentiment" not in frame.columns:
        raise HTTPException(409, "Sentiment has not been computed for this dataset yet.")
    if body.kind == "recommendations":
        report = rc.build_report(frame, filters, top_n=body.top_n, window_months=body.window_months)
        if report["status"] == "no_data":
            raise HTTPException(422, "No complaints match those filters.")
        top = report["items"][0] if report["items"] else None
        headline = f"{report['dataset']['complaints']:,} complaints; top priority: {top['issue']} ({top['tier']})" if top else "No issues"
    else:
        report = _summary_report(frame, filters)
        if report["metrics"]["total_complaints"] == 0:
            raise HTTPException(422, "No complaints match those filters.")
        m = report["metrics"]
        headline = f"{m['total_complaints']:,} complaints, {m['unique_products']} products, {m['unique_issues']} issues"
    title = body.title or f"{'Recommendations' if body.kind == 'recommendations' else 'Summary'} - {ds.original_filename}"
    a = Analysis(dataset_id=ds.id, user_id=user.id, kind=body.kind, title=title[:120], headline=headline[:300],
                 filters=body.filters.model_dump(), summary=json.loads(json.dumps(report, default=str)))
    db.add(a)
    db.commit()
    return {**_out(a, ds.original_filename), "report": a.summary}


@router.get("/api/analyses", response_model=list[AnalysisOut])
def list_analyses(user: CurrentUser, db: DB, dataset_id: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=200)):
    q = (select(Analysis, Dataset.original_filename).join(Dataset, Dataset.id == Analysis.dataset_id)
         .where(Analysis.user_id == user.id).order_by(Analysis.created_at.desc()).limit(limit))
    if dataset_id:
        q = q.where(Analysis.dataset_id == dataset_id)
    # the heavy `summary` column is not needed for the list
    return [_out(a, name) for a, name in db.execute(q.options(__import__("sqlalchemy.orm", fromlist=["defer"]).defer(Analysis.summary)))]


def _owned(analysis_id: uuid.UUID, user, db) -> tuple[Analysis, str]:
    row = db.execute(select(Analysis, Dataset.original_filename).join(Dataset, Dataset.id == Analysis.dataset_id)
                     .where(Analysis.id == analysis_id, Analysis.user_id == user.id)).first()
    if row is None:
        raise HTTPException(404, "Report not found.")
    return row


@router.get("/api/analyses/{analysis_id}", response_model=AnalysisDetailOut)
def get_analysis(analysis_id: uuid.UUID, user: CurrentUser, db: DB):
    a, name = _owned(analysis_id, user, db)
    return {**_out(a, name), "report": a.summary}


@router.delete("/api/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: uuid.UUID, user: CurrentUser, db: DB):
    a, _ = _owned(analysis_id, user, db)
    db.delete(a)
    db.commit()


def _summary_csv(rep: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["section", "name", "count", "pct"])
    for k, label in (("top_products", "product"), ("top_issues", "issue")):
        for r in rep[k]:
            w.writerow([label, r["name"], r["count"], r["pct"]])
    for r in rep["monthly"]:
        w.writerow(["month", r["month"], r["count"], ""])
    for r in rep["yearly"]:
        w.writerow(["year", r["year"], r["count"], "partial year" if r["partial"] else ""])
    if rep.get("sentiment"):
        for k, v in rep["sentiment"]["counts"].items():
            w.writerow(["sentiment", k, v, rep["sentiment"]["pct"][k]])
    return buf.getvalue()


def _summary_md(rep: dict, title: str) -> str:
    m = rep["metrics"]
    L = [f"# {title}", "", f"{m['total_complaints']:,} complaints, {m['unique_products']} products, {m['unique_issues']} issues, "
         f"{m['date_min']} to {m['date_max']}. {m['narrative_pct']}% have a narrative.", "", "## Top products"]
    L += [f"- {r['name']}: {r['count']:,} ({r['pct']}%)" for r in rep["top_products"]] + ["", "## Top issues"]
    L += [f"- {r['name']}: {r['count']:,} ({r['pct']}%)" for r in rep["top_issues"]]
    if rep.get("sentiment"):
        s = rep["sentiment"]
        L += ["", "## Sentiment (VADER estimate)", f"- Negative {s['pct']['Negative']}%, Neutral {s['pct']['Neutral']}%, Positive {s['pct']['Positive']}% of {s['analysed']:,} narratives", f"- {s['note']}"]
    return "\n".join(L)


@router.get("/api/analyses/{analysis_id}/export")
def export_analysis(analysis_id: uuid.UUID, user: CurrentUser, db: DB, format: str = Query("json", pattern="^(json|csv|md)$")):
    a, _ = _owned(analysis_id, user, db)
    rep, short = a.summary, str(a.id)[:8]
    headers = lambda ext: {"Content-Disposition": f'attachment; filename="report_{short}.{ext}"'}
    if format == "json":
        return JSONResponse(rep, headers=headers("json"))
    if a.kind == "recommendations":
        text = rc.to_csv(rep) if format == "csv" else rc.to_markdown(rep)
    else:
        text = _summary_csv(rep) if format == "csv" else _summary_md(rep, a.title or "Summary")
    return PlainTextResponse(text, media_type="text/csv" if format == "csv" else "text/markdown", headers=headers(format))
