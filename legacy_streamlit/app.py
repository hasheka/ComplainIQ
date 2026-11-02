
import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

# -----------------------------
# Page Configuration
# -----------------------------
st.set_page_config(
    page_title="Customer Complaint Analysis",
    page_icon="📊",
    layout="wide"
)

# -----------------------------
# Dashboard Header
# -----------------------------
st.title("📊 AI-Powered Customer Complaint Root Cause Analysis")

st.markdown(
    "Analyze customer complaints, identify recurring issues, "
    "and discover complaint trends over time."
)

st.divider()

st.subheader("Welcome to the Complaint Analysis Dashboard")

st.write(
    "This system analyzes consumer financial complaints using "
    "data analytics and machine learning to support better "
    "business decisions."
)

# -----------------------------
# Load Dataset
# -----------------------------
DATA_PATH = Path(r"C:\Users\hashe\Consumer_Complaints.csv")


@st.cache_data
def load_data(path):
    return pd.read_csv(
        path,
        usecols=[
            "Date received",
            "Product",
            "Issue",
            "Sub-issue"
        ]
    )


if not DATA_PATH.exists():
    st.error(f"Dataset not found: {DATA_PATH}")
    st.stop()

df = load_data(str(DATA_PATH))

df["Date received"] = pd.to_datetime(
    df["Date received"],
    errors="coerce"
)

# -----------------------------
# Complaint Overview
# -----------------------------
st.divider()
st.subheader("📌 Complaint Overview")

col1, col2, col3, col4 = st.columns(4)

col1.metric(
    "Total Complaints",
    f"{len(df):,}"
)

col2.metric(
    "Financial Products",
    df["Product"].nunique()
)

col3.metric(
    "Complaint Issues",
    df["Issue"].nunique()
)

valid_dates = df["Date received"].dropna()

if not valid_dates.empty:
    date_range = (
        f"{valid_dates.min().year}–"
        f"{valid_dates.max().year}"
    )
else:
    date_range = "Unavailable"

col4.metric("Date Range", date_range)

# -----------------------------
# Chart 1: Top 10 Financial Products
# -----------------------------
st.divider()
st.subheader("📊 Top 10 Financial Products by Complaints")

product_counts = (
    df["Product"]
    .dropna()
    .value_counts()
    .head(10)
    .sort_values()
)

fig, ax = plt.subplots(figsize=(10, 5))

product_counts.plot(
    kind="barh",
    ax=ax
)

ax.set_xlabel("Number of Complaints")
ax.set_ylabel("Financial Product")
ax.set_title("Top 10 Financial Products")
ax.ticklabel_format(
    axis="x",
    style="plain",
    useOffset=False
)
ax.grid(axis="x", linestyle="--", alpha=0.3)

fig.tight_layout()
st.pyplot(fig)
plt.close(fig)

# -----------------------------
# Chart 2: Monthly Complaint Trends
# -----------------------------
st.divider()
st.subheader("📈 Monthly Customer Complaint Trends")

valid_df = df.dropna(
    subset=["Date received"]
).copy()

valid_df["Month"] = (
    valid_df["Date received"]
    .dt.to_period("M")
    .astype(str)
)

monthly_complaints = (
    valid_df.groupby("Month")
    .size()
    .sort_index()
)

fig, ax = plt.subplots(figsize=(14, 5))

ax.plot(
    monthly_complaints.index,
    monthly_complaints.values,
    marker="o",
    markersize=3,
    linewidth=1.5
)

ax.set_xlabel("Month")
ax.set_ylabel("Number of Complaints")
ax.set_title("Monthly Customer Complaint Trends")
ax.ticklabel_format(
    axis="y",
    style="plain",
    useOffset=False
)
ax.tick_params(
    axis="x",
    rotation=90,
    labelsize=8
)
ax.grid(axis="y", linestyle="--", alpha=0.3)

fig.tight_layout()
st.pyplot(fig)
plt.close(fig)

# -----------------------------
# Chart 3: Top 10 Complaint Issues
# -----------------------------
st.divider()
st.subheader("🔎 Top 10 Most Reported Complaint Issues")

issue_counts = (
    df["Issue"]
    .dropna()
    .value_counts()
    .head(10)
    .sort_values()
)

fig, ax = plt.subplots(figsize=(12, 6))

issue_counts.plot(
    kind="barh",
    ax=ax
)

ax.set_xlabel("Number of Complaints")
ax.set_ylabel("Complaint Issue")
ax.set_title("Top 10 Most Reported Complaint Issues")
ax.ticklabel_format(
    axis="x",
    style="plain",
    useOffset=False
)
ax.grid(axis="x", linestyle="--", alpha=0.3)

fig.tight_layout()
st.pyplot(fig)
plt.close(fig)

# -----------------------------
# Footer
# -----------------------------
st.divider()
st.caption(
    "AI-Powered Customer Complaint Root Cause Analysis System"
)
