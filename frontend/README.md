# ComplainIQ frontend

React + TypeScript + Vite + Tailwind + Recharts. Started from a generated design, then adapted to this project's API.
In production the built files are served by the FastAPI backend from the SAME origin (no CORS, cookies just work).

```bash
npm ci
npm run dev        # http://localhost:5173, proxies /api to http://127.0.0.1:8000 (override with API_PROXY_TARGET)
npm run build      # creates dist/, which the backend serves (FRONTEND_DIR)
npm test           # 100 component and API tests (jsdom, no server needed)
npm run lint && npm run typecheck
# optional: the real api.ts against a running backend (see src/test/live.contract.test.ts)
LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 LIVE_CSV=/path/to/file.csv npx vitest run src/test/live
```

## Where things are
* `src/services/apiClient.ts` - fetch wrapper, error messages, 401 handling, upload with progress, downloads
* `src/services/api.ts` - one function per endpoint, plus the adapters that map backend fields to what the charts expect
* `src/context/` - `AuthContext` (who is signed in) and `DatasetContext` (which dataset is selected, polling while one is cleaning)
* `src/pages/` - Landing, Login/Register, Dashboard, Data & Upload, AI Prediction, Settings
* `src/pages/pending/` - pages from the original design NOT yet connected (excluded from the build, see the root README)
* `src/config/brand.ts` - the product name, in one place (also edit `<title>` in `index.html`)
* `src/test/` - fake backend, real-response fixtures (captured from the running API), live contract test

The font (Inter) is bundled with the app; nothing is loaded from third-party servers, which the strict
Content-Security-Policy would block anyway.
