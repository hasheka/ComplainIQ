# ComplainIQ
###CUSTOMER COMPLAINT ANALYSIS AND ROOT CAUSE DETECTIONstem

CUSTOMER INSIGHT AI is a web-based complaint intelligence platform developed as a final-year B.Sc. Artificial Intelligence and Machine Learning project at AMET University.

The system analyses consumer financial complaints using data processing, machine learning and natural language processing techniques. It helps users explore complaint patterns, understand sentiment trends, identify areas that need investigation and generate data-supported recommendations.

## Project Overview

Financial institutions receive large volumes of customer complaints. Analysing these complaints manually can be time-consuming.

This project provides an integrated platform to:
- Upload and process consumer complaint datasets.
- Explore complaint trends and product-wise distributions.
- Predict the financial product associated with a complaint narrative.
- Analyse complaint sentiment.
- Identify frequently reported issues and patterns.
- Generate recommendations for further investigation.
- Save and export analysis reports.

## Key Features

| Module | Description |
|---|---|
| Dashboard | Displays an overview of complaint data and key statistics. |
| Data Upload | Uploads complaint datasets and provides data-quality information. |
| Complaint Analytics | Explores product distributions, issue frequencies and trends. |
| AI Complaint Prediction | Predicts the financial product category from complaint text. |
| Sentiment Analysis | Uses VADER to estimate positive, negative and neutral sentiment. |
| Root Cause Analysis | Examines complaint patterns and highlights areas for investigation. |
| Recommendations | Generates rule-based recommendations using complaint patterns and priority signals. |
| Reports & History | Saves analysis reports and supports report exports. |
| Settings | Provides account and application settings. |

## Technology Stack

**Frontend**
- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Lucide React

**Backend**
- Python
- FastAPI
- SQLAlchemy
- SQLite
- Alembic

**Machine Learning and NLP**
- Scikit-learn
- TF-IDF Vectorization
- Logistic Regression
- VADER Sentiment Analysis
- Pandas
- NumPy

## Machine Learning Approach

The complaint prediction module uses a TF-IDF vectorizer and a Logistic Regression classifier.

The text-processing pipeline includes:
1. Converting complaint text to lowercase.
2. Removing unwanted characters.
3. Removing stopwords.
4. Converting text into numerical features using TF-IDF.
5. Predicting the financial product category using Logistic Regression.

**Model details**
- Classification algorithm: Logistic Regression
- Feature extraction: TF-IDF
- Maximum TF-IDF features: 3,000
- Predicted categories: 12 product classes
- Reported held-out test accuracy: 85.02%

The model predicts the financial product category. It does not predict the complaint issue or establish the actual cause of a complaint.

## Sentiment Analysis

The platform uses VADER (Valence Aware Dictionary and sEntiment Reasoner) to estimate the sentiment expressed in complaint narratives.

Sentiment categories are assigned using the following compound-score thresholds:
- Positive: score greater than or equal to 0.05
- Negative: score less than or equal to -0.05
- Neutral: score between -0.05 and 0.05

Sentiment analysis is an automated estimate and should not be treated as a definitive assessment of customer satisfaction.

## Root Cause Analysis and Recommendations

The system examines complaint frequency, trends, product distribution, sub-issues and sentiment information to highlight patterns that may require attention.

Recommendations are generated using predefined rules and measurable priority signals.

Complaint frequency alone does not prove why a problem occurs. Therefore, the platform presents recommendations as investigation guidance rather than confirmed root causes.

## Dataset

The project is designed to work with the Consumer Financial Protection Bureau (CFPB) Consumer Complaint Database.

The dataset used during project development contains approximately:
- 777,959 complaint records
- 18 product categories
- 158 issue categories
- Complaint dates ranging from December 2011 to May 2017

The dataset is not included in this repository. Users must obtain the dataset separately and upload it through the application's Data Upload page.

Do not upload private customer information or the original complaint dataset to this repository.

## Project Structure

```text
customer-insight-ai/
│
├── backend/             # FastAPI backend and analysis modules
│   ├── data/            # Recommendation rules and supporting data
│   └── routes/          # API route modules
│
├── frontend/            # React and TypeScript application
│   └── src/
│       ├── components/
│       ├── config/
│       ├── context/
│       ├── layouts/
│       ├── pages/
│       ├── services/
│       └── utils/
│
├── models/              # Trained ML model and TF-IDF vectorizer
├── migrations/          # Database migrations
├── tests/               # Backend and frontend tests
├── scripts/             # Verification and utility scripts
├── docs/                # Project documentation
├── legacy_streamlit/    # Original Streamlit application
│
├── requirements.txt
├── setup.bat
├── start.bat
├── run_tests.bat
└── README.md


