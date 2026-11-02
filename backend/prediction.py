"""Loads the trained model + TF-IDF vectorizer and predicts the complaint's PRODUCT.

Verified facts about the supplied model (from the training notebook):
  * target       : the `Product` column (12 classes) - NOT the Issue column;
  * input text   : narrative -> lower-case -> delete every char except a-z/whitespace
                   -> remove 18 stopwords -> TfidfVectorizer(max_features=3000);
  * model        : LogisticRegression(max_iter=1000, random_state=42);
  * test score   : 85.02% accuracy on a stratified 80/20 hold-out split.
The preprocessing below is a copy of the notebook's, so inputs are transformed
exactly as they were during training.
"""
from __future__ import annotations

import hashlib
import warnings
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import re

from .config import Settings, settings as default_settings

TRAINED_TARGET = "Product"

# Exactly the 18 stopwords used in the training notebook (cell 5).
STOPWORDS = frozenset({
    "the", "is", "and", "a", "to", "of", "in", "for", "on", "with",
    "this", "that", "i", "my", "was", "have", "has", "been",
})
_NON_LETTERS = re.compile(r"[^a-z\s]")
LOW_CONFIDENCE = 0.50


class ModelError(RuntimeError):
    """Model files are missing, tampered with, or incompatible."""


# --------------------------------------------------------------------------
# Text preprocessing (must match training)
# --------------------------------------------------------------------------
def clean_text(text: str) -> str:
    """Notebook's clean_text: lower-case, delete everything except a-z and whitespace.
    Note: apostrophes are deleted WITHOUT a space ("don't" -> "dont"), as in training."""
    return _NON_LETTERS.sub("", text.lower())


def preprocess(text: str) -> str:
    return " ".join(w for w in clean_text(text).split() if w not in STOPWORDS)


# --------------------------------------------------------------------------
# Loading + compatibility checks
# --------------------------------------------------------------------------
def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


@dataclass
class ModelBundle:
    model: object
    vectorizer: object
    classes: list[str]
    compatibility: dict = field(default_factory=dict)


def load_bundle(cfg: Settings = default_settings) -> ModelBundle:
    """Load and VERIFY the model files. Raises ModelError with a fix-it message."""
    for label, p in (("model", cfg.model_path), ("vectorizer", cfg.vectorizer_path)):
        if not Path(p).exists():
            raise ModelError(
                f"The {label} file was not found at {p}. Copy best_complaint_model.pkl and "
                "tfidf_vectorizer.pkl into the models/ folder (or set MODEL_PATH / VECTORIZER_PATH). "
                "If you no longer have them, re-run the training notebook in docs/.")
    for label, p, expected in (("model", cfg.model_path, cfg.model_sha256),
                               ("vectorizer", cfg.vectorizer_path, cfg.vectorizer_sha256)):
        if expected and _sha256(Path(p)) != expected.lower():
            raise ModelError(f"The {label} file does not match the expected SHA-256 hash. "
                             "Refusing to load it (pickle files can execute code).")

    caught: list[str] = []
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            model = joblib.load(cfg.model_path)
            vec = joblib.load(cfg.vectorizer_path)
        except Exception as exc:  # corrupt or incompatible pickle
            raise ModelError(f"Could not load the model files: {exc}") from exc
        caught = sorted({str(x.message).split(" This might")[0] for x in w if "Inconsistent" in x.category.__name__})

    problems = []
    if not hasattr(model, "predict_proba") or not hasattr(model, "classes_"):
        problems.append("model has no predict_proba/classes_")
    if not hasattr(vec, "vocabulary_"):
        problems.append("vectorizer is not fitted")
    if not problems and getattr(model, "n_features_in_", None) != len(vec.vocabulary_):
        problems.append(f"feature mismatch: model expects {model.n_features_in_} features, "
                        f"vectorizer produces {len(vec.vocabulary_)}")
    if problems:
        raise ModelError("Model and vectorizer are incompatible: " + "; ".join(problems))

    # smoke test: a fixed sentence must produce one of the model's own labels
    probe = vec.transform([preprocess("They keep calling me about a debt that is not mine")])
    label = model.predict(probe)[0]
    if label not in set(model.classes_):
        raise ModelError("Smoke test failed: the model returned an unknown label.")
    leaked = [w for w in STOPWORDS if w in vec.vocabulary_]
    compat = {"n_features": len(vec.vocabulary_), "n_classes": len(model.classes_),
              "version_warnings": caught, "smoke_test_label": str(label),
              "preprocessing_matches_training": not leaked}
    return ModelBundle(model, vec, [str(c) for c in model.classes_], compat)


@lru_cache(maxsize=1)
def get_bundle() -> ModelBundle:
    return load_bundle()


# --------------------------------------------------------------------------
# Prediction
# --------------------------------------------------------------------------
def predict_one(bundle: ModelBundle, text: str, top_k: int = 3,
                max_chars: int = default_settings.max_prediction_chars) -> dict:
    """Predict the product category for one complaint.

    `confidence` is the model's own predicted probability. It is NOT calibrated
    (0.80 does not mean "right 80% of the time"), so treat it as a relative signal.
    """
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Please enter complaint text.")
    text = text[:max_chars]
    X = bundle.vectorizer.transform([preprocess(text)])
    if X.nnz == 0:
        # No word in the text is in the 3,000-word vocabulary: any answer would be a guess.
        return {"status": "insufficient_text", "predicted_product": None, "confidence": None,
                "message": "The text has no words the model recognises. Please describe the problem in more detail."}
    proba = bundle.model.predict_proba(X)[0]
    order = np.argsort(proba)[::-1][:top_k]
    top = [{"product": bundle.classes[i], "probability": round(float(proba[i]), 4)} for i in order]
    conf = top[0]["probability"]
    return {"status": "ok", "predicted_product": top[0]["product"], "confidence": conf,
            "confidence_level": "low" if conf < LOW_CONFIDENCE else "moderate" if conf < 0.8 else "high",
            "top_predictions": top, "target": TRAINED_TARGET,
            "note": "Confidence is the model's raw probability and is not calibrated."}


def predict_batch(bundle: ModelBundle, texts: pd.Series, chunk_size: int = 20_000) -> pd.DataFrame:
    """Predict for many narratives. Missing/unusable text -> missing prediction
    (never a made-up label). Returns a frame aligned to `texts.index`."""
    out = pd.DataFrame({"predicted_product": pd.Series(pd.NA, index=texts.index, dtype="string"),
                        "confidence": pd.Series(np.nan, index=texts.index, dtype="float64")})
    valid = texts.dropna()
    valid = valid[valid.astype(str).str.strip() != ""]
    idx = valid.index
    for start in range(0, len(idx), chunk_size):
        sl = idx[start:start + chunk_size]
        cleaned = [preprocess(t[: default_settings.max_prediction_chars]) for t in valid.loc[sl].astype(str)]
        X = bundle.vectorizer.transform(cleaned)
        has_words = np.asarray(X.getnnz(axis=1) > 0)
        if not has_words.any():
            continue
        proba = bundle.model.predict_proba(X[has_words])
        best = proba.argmax(axis=1)
        good = sl[has_words]
        out.loc[good, "predicted_product"] = np.array(bundle.classes, dtype=object)[best]
        out.loc[good, "confidence"] = proba[np.arange(len(best)), best]
    return out


# --------------------------------------------------------------------------
# Model card: what the model is, how good it is, where it is weak
# --------------------------------------------------------------------------
def load_evaluation(cfg: Settings = default_settings) -> dict:
    p = Path(cfg.eval_report_path)
    if not p.exists():
        return {"available": False}
    rep = pd.read_csv(p, index_col=0)
    classes = [i for i in rep.index if i not in ("accuracy", "macro avg", "weighted avg")]
    per_class = [{"product": c, "precision": round(float(rep.loc[c, "precision"]), 3),
                  "recall": round(float(rep.loc[c, "recall"]), 3),
                  "f1": round(float(rep.loc[c, "f1-score"]), 3), "support": int(rep.loc[c, "support"])}
                 for c in classes]
    return {"available": True,
            "accuracy": round(float(rep.loc["accuracy", "precision"]), 4),
            "macro_f1": round(float(rep.loc["macro avg", "f1-score"]), 3),
            "test_size": int(rep.loc["macro avg", "support"]),
            "per_class": per_class,
            "weak_classes": [c["product"] for c in per_class if c["f1"] < 0.5]}


def model_card(bundle: ModelBundle, cfg: Settings = default_settings) -> dict:
    ev = load_evaluation(cfg)
    return {"model_type": type(bundle.model).__name__, "target": TRAINED_TARGET,
            "classes": bundle.classes, "compatibility": bundle.compatibility, "evaluation": ev,
            "training_notes": ["Trained only on complaints that have a narrative (157,865 rows).",
                               "Evaluated on a stratified 20% hold-out split (random_state=42).",
                               "It predicts the Product category only; it does not predict the Issue.",
                               "Products introduced in CFPB's 2017 category renaming are not model classes."]}


def label_coverage(bundle: ModelBundle, products: pd.Series) -> dict:
    """How many rows have a Product value the model can actually output."""
    known = set(bundle.classes)
    p = products.dropna().astype(str)
    covered = p.isin(known)
    return {"rows_with_model_label": int(covered.sum()), "rows_without_model_label": int((~covered).sum()),
            "unknown_products": sorted(set(p[~covered]))}
