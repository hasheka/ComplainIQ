"""Dataset validation, column mapping, profiling and cleaning.

Design rules (from the project brief):
  * never silently delete data - every change is counted in a CleaningReport;
  * missing narrative text stays missing (it is NOT turned into "neutral");
  * rows with an unreadable date are KEPT, but excluded from time-based charts;
  * only load the columns we need, so the 778k-row file fits in modest memory.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

import pandas as pd

# --------------------------------------------------------------------------
# Canonical schema
# --------------------------------------------------------------------------
REQUIRED = ["date", "product", "issue"]
OPTIONAL = ["sub_product", "sub_issue", "narrative", "company", "state", "complaint_id"]
CANONICAL = REQUIRED + OPTIONAL

# Aliases are compared after normalising (lower-case, letters/digits only),
# so "Date received", "date_received" and "DATE-RECEIVED" all match.
ALIASES: dict[str, list[str]] = {
    "date": ["datereceived", "date", "complaintdate", "receiveddate", "datecreated", "createdat", "submitteddate"],
    "product": ["product", "productcategory", "producttype", "category"],
    "issue": ["issue", "issuetype", "complaintissue", "complaintcategory", "problem"],
    "sub_product": ["subproduct", "productsubtype"],
    "sub_issue": ["subissue", "issuesubtype", "subcategory"],
    "narrative": ["consumercomplaintnarrative", "narrative", "complaintnarrative", "complainttext",
                  "complaint", "description", "text", "comments", "consumercomplaint"],
    "company": ["company", "companyname", "organization", "organisation"],
    "state": ["state", "stateprovince"],
    "complaint_id": ["complaintid", "id", "caseid", "ticketid", "complaintnumber"],
}

ENCODINGS = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]
TEXT_COLUMNS = ["product", "sub_product", "issue", "sub_issue", "company", "state"]
# Strings that mean "no text" in exported complaint data.
NULL_LIKE = {"", "nan", "none", "null", "n/a", "na", "-", "--"}


class DatasetError(ValueError):
    """Raised for problems the user can fix (bad file, missing columns...)."""


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


# --------------------------------------------------------------------------
# File validation and loading
# --------------------------------------------------------------------------
def validate_file(path: str | Path, max_mb: int = 500) -> Path:
    path = Path(path)
    if not path.exists() or not path.is_file():
        raise DatasetError("File not found.")
    if path.suffix.lower() != ".csv":
        raise DatasetError("Unsupported file type. Please upload a .csv file.")
    size = path.stat().st_size
    if size == 0:
        raise DatasetError("The file is empty.")
    if size > max_mb * 1024 * 1024:
        raise DatasetError(f"File is too large ({size / 1e6:.0f} MB). The limit is {max_mb} MB.")
    with open(path, "rb") as fh:
        if b"\x00" in fh.read(8192):
            raise DatasetError("This does not look like a text CSV file (binary content found).")
    return path


def detect_encoding(path: str | Path) -> str:
    """First encoding that can decode the start of the file."""
    with open(path, "rb") as fh:
        sample = fh.read(1_000_000)
    for enc in ENCODINGS:
        try:
            sample.decode(enc)
            return enc
        except UnicodeDecodeError:
            continue
    raise DatasetError("Could not decode the file. Please save it as UTF-8 CSV.")


def read_header(path: str | Path) -> tuple[list[str], str]:
    enc = detect_encoding(path)
    try:
        header = pd.read_csv(path, nrows=0, encoding=enc).columns.tolist()
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise DatasetError(f"The file could not be parsed as CSV: {exc}") from exc
    if not header:
        raise DatasetError("The CSV has no columns.")
    return [str(c) for c in header], enc


# --------------------------------------------------------------------------
# Column detection / mapping
# --------------------------------------------------------------------------
@dataclass
class ColumnMapping:
    mapping: dict[str, str]            # canonical -> original column name
    missing_required: list[str]
    unmapped_columns: list[str]        # original columns we did not use

    @property
    def ok(self) -> bool:
        return not self.missing_required


def detect_columns(columns: Iterable[str], overrides: dict[str, str] | None = None) -> ColumnMapping:
    """Match the file's headers to our canonical names.

    `overrides` lets the user fix a wrong/missing guess: {"issue": "Problem Type"}.
    """
    columns = list(columns)
    by_norm: dict[str, str] = {}
    for c in columns:
        by_norm.setdefault(_norm(c), c)
    mapping: dict[str, str] = {}
    for canon in CANONICAL:
        for alias in ALIASES[canon]:
            if alias in by_norm and by_norm[alias] not in mapping.values():
                mapping[canon] = by_norm[alias]
                break
    for canon, orig in (overrides or {}).items():
        if canon not in CANONICAL:
            raise DatasetError(f"Unknown field '{canon}'.")
        if orig not in columns:
            raise DatasetError(f"Column '{orig}' does not exist in the file.")
        mapping[canon] = orig
    missing = [c for c in REQUIRED if c not in mapping]
    unmapped = [c for c in columns if c not in mapping.values()]
    return ColumnMapping(mapping, missing, unmapped)


def load_dataset(path: str | Path, overrides: dict[str, str] | None = None,
                 max_mb: int = 500) -> tuple[pd.DataFrame, ColumnMapping]:
    """Validate, detect columns, then read ONLY the mapped columns."""
    path = validate_file(path, max_mb)
    header, enc = read_header(path)
    cm = detect_columns(header, overrides)
    if not cm.ok:
        raise DatasetError(
            "Required column(s) not found: " + ", ".join(cm.missing_required)
            + ". Columns in your file: " + ", ".join(header[:30])
            + ". Use the column-mapping step to match them."
        )
    rename = {orig: canon for canon, orig in cm.mapping.items()}
    try:
        df = pd.read_csv(path, usecols=list(cm.mapping.values()), encoding=enc,
                         dtype=str, low_memory=False)
    except (pd.errors.ParserError, ValueError) as exc:
        raise DatasetError(f"The file could not be read: {exc}") from exc
    df = df.rename(columns=rename)
    if df.empty:
        raise DatasetError("The CSV contains a header but no data rows.")
    return df, cm


# --------------------------------------------------------------------------
# Cleaning
# --------------------------------------------------------------------------
@dataclass
class CleaningReport:
    rows_in: int = 0
    rows_out: int = 0
    duplicate_ids_removed: int = 0
    exact_duplicate_rows_found: int = 0
    exact_duplicate_rows_removed: int = 0
    date_format_used: str | None = None
    invalid_dates: int = 0
    invalid_date_examples: list[str] = field(default_factory=list)
    blank_text_to_missing: dict[str, int] = field(default_factory=dict)
    missing_by_column: dict[str, int] = field(default_factory=dict)
    narratives_present: int = 0
    narratives_missing: int = 0
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%m-%d-%Y", "%Y/%m/%d", "%d-%m-%Y"]


def parse_dates(series: pd.Series) -> tuple[pd.Series, str]:
    """Try common formats on a sample, choose the best, parse the whole column.

    US (%m/%d) is tried before day-first, because the supplied CFPB data is US
    format. For ambiguous files the best-scoring format wins and is reported.
    """
    s = series.astype("string").str.strip()
    sample = s.dropna().head(5000)
    best_fmt, best_ok = None, -1
    for fmt in DATE_FORMATS:
        ok = pd.to_datetime(sample, format=fmt, errors="coerce").notna().sum()
        if ok > best_ok:
            best_fmt, best_ok = fmt, ok
    if best_ok > 0:
        parsed = pd.to_datetime(s, format=best_fmt, errors="coerce")
        # ISO-like timestamps ("2017-03-01 12:00:00") fall back to flexible parsing
        still_bad = parsed.isna() & s.notna()
        if still_bad.any():
            parsed = parsed.fillna(pd.to_datetime(s[still_bad], errors="coerce"))
        return parsed, best_fmt
    return pd.to_datetime(s, errors="coerce"), "flexible"


def clean_dataset(df: pd.DataFrame, drop_exact_duplicates: bool = False,
                  copy: bool = True) -> tuple[pd.DataFrame, CleaningReport]:
    """Return (cleaned DataFrame, report). The input frame is not modified unless copy=False.

    What this does, in order (each step is counted in the report):
      1. trims whitespace; empty / "N/A"-style strings become real missing values;
      2. parses dates; unparseable dates become NaT (rows are kept);
      3. removes rows whose Complaint ID repeats (true duplicates);
      4. counts exact duplicate rows - removed only if `drop_exact_duplicates`,
         because two different customers can file identical complaints;
      5. adds `has_narrative` and converts repeated labels to memory-saving categories.
    """
    rep = CleaningReport(rows_in=len(df))
    out = df.copy() if copy else df  # copy=False saves memory on very large files (modifies df)

    # 1. whitespace / null-like strings
    for col in [c for c in out.columns]:
        s = out[col].astype("string").str.strip()
        blank = s.str.lower().isin(NULL_LIKE) & out[col].notna()
        # keep a genuine value like "NA" for state? only treat as missing for text/narrative columns
        if col == "state":
            blank = s.isin(["", "nan", "null", "none"]) & out[col].notna()
        if blank.any():
            rep.blank_text_to_missing[col] = int(blank.sum())
        s = s.mask(blank)
        out[col] = s

    # 2. dates
    parsed, fmt = parse_dates(out["date"])
    rep.date_format_used = fmt
    bad = parsed.isna()
    rep.invalid_dates = int(bad.sum())
    if rep.invalid_dates:
        rep.invalid_date_examples = out.loc[bad, "date"].dropna().astype(str).unique()[:5].tolist()
        rep.notes.append(f"{rep.invalid_dates:,} rows have a missing/unreadable date; they are kept but excluded from time-based charts.")
    out["date"] = parsed

    # 3. duplicate complaint IDs
    if "complaint_id" in out.columns:
        dup = out["complaint_id"].notna() & out["complaint_id"].duplicated(keep="first")
        rep.duplicate_ids_removed = int(dup.sum())
        if rep.duplicate_ids_removed:
            out = out.loc[~dup]
            rep.notes.append(f"Removed {rep.duplicate_ids_removed:,} rows with a repeated Complaint ID.")

    # 4. exact duplicates (excluding the ID column, which is unique per row)
    cols = [c for c in out.columns if c != "complaint_id"]
    exact = out.duplicated(subset=cols, keep="first")
    rep.exact_duplicate_rows_found = int(exact.sum())
    if drop_exact_duplicates and rep.exact_duplicate_rows_found:
        out = out.loc[~exact]
        rep.exact_duplicate_rows_removed = rep.exact_duplicate_rows_found
    elif rep.exact_duplicate_rows_found:
        rep.notes.append(f"{rep.exact_duplicate_rows_found:,} rows are identical to another row apart from the ID; "
                         "they were kept (different customers can file the same complaint).")

    # 5. narrative flag + categories
    if "narrative" in out.columns:
        out["has_narrative"] = out["narrative"].notna()
    else:
        out["has_narrative"] = False
        rep.notes.append("No complaint-narrative column found: prediction and sentiment analysis are unavailable.")
    rep.narratives_present = int(out["has_narrative"].sum())
    rep.narratives_missing = int((~out["has_narrative"]).sum())

    for col in TEXT_COLUMNS:
        if col in out.columns:
            out[col] = out[col].astype("category")

    out = out.reset_index(drop=True)
    rep.rows_out = len(out)
    rep.missing_by_column = {c: int(out[c].isna().sum()) for c in out.columns if c != "has_narrative"}
    return out, rep


# --------------------------------------------------------------------------
# Profiling / preview / export
# --------------------------------------------------------------------------
def profile_dataset(df: pd.DataFrame) -> dict:
    """Data-quality summary for the upload page."""
    n = len(df)
    cols = []
    for c in df.columns:
        if c == "has_narrative":
            continue
        miss = int(df[c].isna().sum())
        cols.append({"column": c, "missing": miss, "missing_pct": round(100 * miss / n, 2) if n else 0.0,
                     "unique": int(df[c].nunique(dropna=True))})
    return {"rows": n, "columns": cols}


def preview(df: pd.DataFrame, n: int = 10, narrative_chars: int = 200) -> list[dict]:
    head = df.head(n).copy()
    if "narrative" in head.columns:
        head["narrative"] = head["narrative"].astype("string").str.slice(0, narrative_chars)
    head["date"] = head["date"].dt.strftime("%Y-%m-%d")
    return head.astype(object).where(head.notna(), None).to_dict(orient="records")


def save_cleaned(df: pd.DataFrame, path: str | Path) -> Path:
    """Parquet is ~10x smaller/faster than CSV for the app's own storage."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    out = df.copy()
    for c in out.select_dtypes("category").columns:
        out[c] = out[c].astype("string")
    out.to_parquet(path, index=False, row_group_size=50_000)   # small row groups = cheap paging
    return path


def load_cleaned(path: str | Path, columns: list[str] | None = None) -> pd.DataFrame:
    """Read the cleaned parquet. Pass `columns` to load only what you need (the narrative column is large)."""
    df = pd.read_parquet(path, columns=columns)
    for col in TEXT_COLUMNS:
        if col in df.columns:
            df[col] = df[col].astype("category")
    return df


def export_cleaned_csv(df: pd.DataFrame, path: str | Path) -> Path:
    """User-facing download: original-style columns, ISO dates."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    out = df.drop(columns=["has_narrative"], errors="ignore").copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out.to_csv(path, index=False, encoding="utf-8")
    return path


def read_page(parquet_path: str | Path, page: int, page_size: int, narrative_chars: int = 200) -> tuple[list[dict], int]:
    """Rows [(page-1)*page_size, page*page_size) without loading the whole file. Returns (rows, total_rows)."""
    import pyarrow.parquet as pq
    pf = pq.ParquetFile(parquet_path)
    total = pf.metadata.num_rows
    start, end = (page - 1) * page_size, min(page * page_size, total)
    if start >= total:
        return [], total
    pieces, seen = [], 0
    for g in range(pf.num_row_groups):
        n = pf.metadata.row_group(g).num_rows
        if seen + n > start and seen < end:
            t = pf.read_row_group(g).to_pandas()
            pieces.append(t.iloc[max(start - seen, 0): end - seen])
        seen += n
        if seen >= end:
            break
    df = pd.concat(pieces, ignore_index=True)
    return preview(df.drop(columns=["has_narrative"], errors="ignore").assign(has_narrative=df["has_narrative"]),
                   n=len(df), narrative_chars=narrative_chars), total


def export_parquet_to_csv(parquet_path: str | Path, csv_path: str | Path) -> Path:
    """Stream the cleaned parquet into a user-facing CSV one batch at a time (low memory)."""
    import pyarrow.parquet as pq
    csv_path = Path(csv_path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = csv_path.with_suffix(".tmp")
    first = True
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        for batch in pq.ParquetFile(parquet_path).iter_batches(batch_size=50_000):
            b = batch.to_pandas().drop(columns=["has_narrative"], errors="ignore")
            b["date"] = pd.to_datetime(b["date"]).dt.strftime("%Y-%m-%d")
            b.to_csv(fh, index=False, header=first)
            first = False
    tmp.replace(csv_path)
    return csv_path
