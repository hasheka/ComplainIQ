import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

const inBrowserLikeEnv = typeof window !== 'undefined';   // the live contract test runs in plain Node

afterEach(() => {
  if (!inBrowserLikeEnv) return;
  cleanup();
  localStorage.clear();
});

if (inBrowserLikeEnv) {
  // jsdom lacks these; Recharts and layout code expect them.
  class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
