import { Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from '@/components/auth/RouteGuards';
import { AppLayout } from '@/layouts/AppLayout';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { DataPage } from '@/pages/DataPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SentimentPage } from '@/pages/SentimentPage';
import { RootCauseAnalysisPage } from '@/pages/RootCauseAnalysisPage';
import { RecommendationsPage } from '@/pages/RecommendationsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { PredictionPage } from '@/pages/PredictionPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="sentiment" element={<SentimentPage />} />
          <Route path="root-cause" element={<RootCauseAnalysisPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="prediction" element={<PredictionPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={<div className="mx-auto max-w-lg px-6 py-24"><NotFoundPage /></div>} />
    </Routes>
  );
}
