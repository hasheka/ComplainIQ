import { BarChart3, BrainCircuit, Database, FileText, LayoutDashboard, Lightbulb, MessageSquareText, Microscope, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/app', label: 'Dashboard', title: 'Executive Dashboard', description: 'Complaint volume, products, issues and sentiment at a glance.', icon: LayoutDashboard },
  { path: '/app/data', label: 'Data & Upload', title: 'Data & Upload', description: 'Upload a CSV, review its quality report and run analyses.', icon: Database },
  { path: '/app/analytics', label: 'Analytics', title: 'Complaint Analytics', description: 'Top issues and products, trends over time, and rising issues.', icon: BarChart3 },
  { path: '/app/sentiment', label: 'Sentiment', title: 'Sentiment Analysis', description: 'How negative complaint narratives are, by product, issue and month.', icon: MessageSquareText },
  { path: '/app/root-cause', label: 'Root Cause', title: 'Root Cause Analysis', description: 'What the data shows about frequent issues, and possible explanations to test.', icon: Microscope },
  { path: '/app/recommendations', label: 'Recommendations', title: 'Solution Recommendations', description: 'Practical, explained actions for the most frequent complaints.', icon: Lightbulb },
  { path: '/app/prediction', label: 'AI Prediction', title: 'AI Complaint Prediction', description: 'Classify a new complaint with the trained model.', icon: BrainCircuit },
  { path: '/app/reports', label: 'Reports', title: 'Reports & History', description: 'Saved reports you can reopen and export.', icon: FileText },
  { path: '/app/settings', label: 'Settings', title: 'Settings', description: 'Your account, privacy and data.', icon: Settings },
];

export function findNavItem(pathname: string): NavItem {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return NAV_ITEMS.find((item) => item.path === clean) ?? NAV_ITEMS[0];
}
