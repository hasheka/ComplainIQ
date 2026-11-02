import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.feature_extraction.text import TfidfVectorizer
from backend import prediction as pr
from backend.config import Settings, settings


def test_preprocess_matches_training_notebook():
    # apostrophes and digits are deleted without a space; stopwords removed
    assert pr.clean_text("I don't have the $5 fee!") == "i dont have the  fee"
    assert pr.preprocess("I don't have the $5 fee!") == "dont fee"
    assert len(pr.STOPWORDS) == 18

def test_model_loads_and_is_compatible(bundle):
    assert len(bundle.classes) == 12
    c = bundle.compatibility
    assert c["n_features"] == 3000 and c["preprocessing_matches_training"]

def test_predicts_notebook_example(bundle):
    r = pr.predict_one(bundle, "I was charged an incorrect amount on my credit card and I want a refund.")
    assert r["status"] == "ok" and r["predicted_product"] == "Credit card" and r["target"] == "Product"

def test_top_predictions_sorted_and_valid(bundle):
    r = pr.predict_one(bundle, "They keep calling me about a debt that is not mine", top_k=3)
    probs = [t["probability"] for t in r["top_predictions"]]
    assert probs == sorted(probs, reverse=True) and sum(probs) <= 1.0001
    assert r["confidence"] == probs[0] and r["confidence_level"] in {"low", "moderate", "high"}

@pytest.mark.parametrize("bad", ["", "   ", None, 123])
def test_empty_or_wrong_type_rejected(bundle, bad):
    with pytest.raises(ValueError):
        pr.predict_one(bundle, bad)

def test_text_with_no_known_words_is_not_guessed(bundle):
    r = pr.predict_one(bundle, "zzzz qqqq 12345 !!!")
    assert r["status"] == "insufficient_text" and r["predicted_product"] is None

def test_very_long_text_is_truncated_not_crashing(bundle):
    assert pr.predict_one(bundle, "mortgage payment escrow " * 5000)["status"] == "ok"

def test_batch_keeps_alignment_and_missing(bundle):
    s = pd.Series(["My mortgage escrow payment was wrong", None, "   ", "zzzz", "Debt collector keeps calling me"],
                  index=[10, 11, 12, 13, 14])
    out = pr.predict_batch(bundle, s)
    assert list(out.index) == [10, 11, 12, 13, 14]
    assert out.loc[10, "predicted_product"] == "Mortgage"
    assert out.loc[[11, 12, 13], "predicted_product"].isna().all()       # never a made-up label
    assert out.loc[[11, 12, 13], "confidence"].isna().all()
    assert out.loc[14, "predicted_product"] == "Debt collection"

def test_batch_matches_single(bundle):
    t = "I disputed the fee on my credit card statement"
    assert pr.predict_batch(bundle, pd.Series([t])).iloc[0, 0] == pr.predict_one(bundle, t)["predicted_product"]


# ---------- failure modes
def test_missing_model_file_gives_actionable_error(tmp_path):
    cfg = Settings(model_path=tmp_path / "nope.pkl", vectorizer_path=settings.vectorizer_path)
    with pytest.raises(pr.ModelError, match="not found"):
        pr.load_bundle(cfg)

def test_hash_mismatch_refuses_to_load():
    cfg = Settings(model_sha256="0" * 64)
    with pytest.raises(pr.ModelError, match="SHA-256"):
        pr.load_bundle(cfg)

def test_correct_hash_accepted():
    cfg = Settings(model_sha256=pr._sha256(settings.model_path))
    assert pr.load_bundle(cfg).classes

def test_incompatible_vectorizer_detected(tmp_path):
    tiny = TfidfVectorizer(max_features=5).fit(["alpha beta gamma delta epsilon zeta"])
    p = tmp_path / "v.pkl"; joblib.dump(tiny, p)
    with pytest.raises(pr.ModelError, match="feature mismatch"):
        pr.load_bundle(Settings(vectorizer_path=p))

def test_corrupt_pickle_detected(tmp_path):
    p = tmp_path / "m.pkl"; p.write_bytes(b"not a pickle")
    with pytest.raises(pr.ModelError, match="Could not load"):
        pr.load_bundle(Settings(model_path=p))


# ---------- model card
def test_evaluation_report_matches_notebook():
    ev = pr.load_evaluation()
    assert ev["accuracy"] == pytest.approx(0.8502, abs=1e-4) and ev["test_size"] == 31573
    assert {"Virtual currency", "Other financial service"} <= set(ev["weak_classes"])

def test_label_coverage_flags_unknown_products(bundle):
    cov = pr.label_coverage(bundle, pd.Series(["Mortgage", "Vehicle loan or lease", None]))
    assert cov["rows_with_model_label"] == 1 and cov["unknown_products"] == ["Vehicle loan or lease"]
