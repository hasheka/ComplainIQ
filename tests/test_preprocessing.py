import pandas as pd
import pytest
from backend import preprocessing as pp
from tests.conftest import write_csv, HEADER, SAMPLE_ROWS


# ---------- file validation
def test_rejects_wrong_extension(tmp_path):
    f = tmp_path / "a.xlsx"; f.write_text("x")
    with pytest.raises(pp.DatasetError, match="Unsupported file type"):
        pp.validate_file(f)

def test_rejects_empty_file(tmp_path):
    f = tmp_path / "a.csv"; f.write_text("")
    with pytest.raises(pp.DatasetError, match="empty"):
        pp.validate_file(f)

def test_rejects_binary_file(tmp_path):
    f = tmp_path / "a.csv"; f.write_bytes(b"abc\x00\x01\x02")
    with pytest.raises(pp.DatasetError, match="binary"):
        pp.validate_file(f)

def test_rejects_too_large(tmp_path):
    f = tmp_path / "a.csv"; f.write_text("a,b\n" + "1,2\n" * 1000)
    with pytest.raises(pp.DatasetError, match="too large"):
        pp.validate_file(f, max_mb=0)

def test_missing_file():
    with pytest.raises(pp.DatasetError, match="not found"):
        pp.validate_file("/no/such/file.csv")


# ---------- column detection
def test_detects_real_cfpb_headers():
    cols = ["Date received", "Product", "Sub-product", "Issue", "Sub-issue", "Consumer complaint narrative",
            "Company", "State", "Complaint ID"]
    cm = pp.detect_columns(cols)
    assert cm.ok
    assert cm.mapping["date"] == "Date received" and cm.mapping["narrative"] == "Consumer complaint narrative"

def test_detects_alternative_names():
    cm = pp.detect_columns(["created_at", "Product Category", "problem", "complaint_text"])
    assert cm.mapping == {"date": "created_at", "product": "Product Category", "issue": "problem",
                          "narrative": "complaint_text"}

def test_reports_missing_required():
    cm = pp.detect_columns(["Product", "Issue"])
    assert cm.missing_required == ["date"] and not cm.ok

def test_override_fixes_mapping():
    cm = pp.detect_columns(["when", "Product", "Issue"], overrides={"date": "when"})
    assert cm.ok

def test_override_with_unknown_column_errors():
    with pytest.raises(pp.DatasetError):
        pp.detect_columns(["a", "Product"], overrides={"date": "zzz"})

def test_load_fails_clearly_when_required_column_missing(tmp_path):
    f = tmp_path / "x.csv"; f.write_text("Product,Issue\nA,B\n")
    with pytest.raises(pp.DatasetError, match="Required column"):
        pp.load_dataset(f)

def test_load_header_only_file(tmp_path):
    f = tmp_path / "x.csv"; f.write_text("Date received,Product,Issue\n")
    with pytest.raises(pp.DatasetError, match="no data rows"):
        pp.load_dataset(f)

def test_reads_cp1252_encoding(tmp_path):
    rows = [("01/05/2016", "Mortgage", "Café fees", "", "Résumé of the problem", "1")]
    f = write_csv(tmp_path / "e.csv", rows, encoding="cp1252")
    df, _ = pp.load_dataset(f)
    assert "Café" in df["issue"].iloc[0]


# ---------- cleaning
def test_invalid_dates_kept_but_counted(cleaned, sample_csv):
    df, _ = pp.load_dataset(sample_csv)
    _, rep = pp.clean_dataset(df)
    assert rep.invalid_dates == 1 and "not a date" in rep.invalid_date_examples
    assert len(cleaned) == 6                      # row kept
    assert cleaned["date"].isna().sum() == 1

def test_missing_narratives_stay_missing(cleaned):
    assert cleaned["has_narrative"].tolist() == [True, False, True, False, True, False]
    assert cleaned["narrative"].isna().sum() == 3       # "", "N/A" and "" became missing
    assert not (cleaned["narrative"] == "").any()

def test_report_reconciles_rows(sample_csv):
    df, _ = pp.load_dataset(sample_csv)
    out, rep = pp.clean_dataset(df)
    assert rep.rows_in == rep.rows_out + rep.duplicate_ids_removed + rep.exact_duplicate_rows_removed
    assert rep.narratives_present + rep.narratives_missing == rep.rows_out

def test_duplicate_complaint_ids_removed(tmp_path):
    rows = SAMPLE_ROWS + [SAMPLE_ROWS[0]]            # same ID "1" again
    df, _ = pp.load_dataset(write_csv(tmp_path / "d.csv", rows))
    out, rep = pp.clean_dataset(df)
    assert rep.duplicate_ids_removed == 1 and len(out) == 6

def test_exact_duplicates_kept_by_default_removed_on_request(tmp_path):
    r = SAMPLE_ROWS[0]
    rows = SAMPLE_ROWS + [r[:-1] + ("99",)]          # identical except ID
    df, _ = pp.load_dataset(write_csv(tmp_path / "d.csv", rows))
    out, rep = pp.clean_dataset(df)
    assert rep.exact_duplicate_rows_found == 1 and len(out) == 7
    out2, rep2 = pp.clean_dataset(df, drop_exact_duplicates=True)
    assert rep2.exact_duplicate_rows_removed == 1 and len(out2) == 6

def test_iso_dates_parse(tmp_path):
    rows = [("2016-03-05", "Mortgage", "X", "", "text", "1")]
    df, _ = pp.load_dataset(write_csv(tmp_path / "i.csv", rows))
    out, rep = pp.clean_dataset(df)
    assert rep.date_format_used == "%Y-%m-%d" and out["date"].iloc[0] == pd.Timestamp("2016-03-05")

def test_input_not_modified_by_default(sample_csv):
    df, _ = pp.load_dataset(sample_csv)
    before = df.copy()
    pp.clean_dataset(df)
    pd.testing.assert_frame_equal(df, before)

def test_dataset_without_narrative_column(tmp_path):
    f = tmp_path / "n.csv"; f.write_text("Date received,Product,Issue\n01/01/2016,A,B\n")
    df, _ = pp.load_dataset(f)
    out, rep = pp.clean_dataset(df)
    assert out["has_narrative"].sum() == 0
    assert any("No complaint-narrative column" in n for n in rep.notes)


# ---------- profile / preview / export
def test_profile_and_preview(cleaned):
    prof = pp.profile_dataset(cleaned)
    assert prof["rows"] == 6
    narr = next(c for c in prof["columns"] if c["column"] == "narrative")
    assert narr["missing"] == 3 and narr["missing_pct"] == 50.0
    rows = pp.preview(cleaned, 3)
    assert len(rows) == 3 and rows[0]["date"] == "2016-01-05"

def test_parquet_roundtrip_and_csv_export(cleaned, tmp_path):
    p = pp.save_cleaned(cleaned, tmp_path / "c.parquet")
    back = pp.load_cleaned(p)
    assert len(back) == len(cleaned) and back["has_narrative"].sum() == 3
    csv = pp.export_cleaned_csv(cleaned, tmp_path / "out.csv")
    exported = pd.read_csv(csv)
    assert "has_narrative" not in exported.columns and exported["date"].iloc[0] == "2016-01-05"
