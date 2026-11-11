# SpendWise AI — Frontend

React 19 + TypeScript + Vite client for SpendWise AI.

## Environment Configuration

Copy `.env.example` to `.env.local` for local development overrides:

```powershell
Copy-Item .env.example .env.local
```

- `VITE_API_BASE_URL` — Base URL of the FastAPI backend without a trailing slash (defaults in `.env.example` to `http://127.0.0.1:8001`).

## Scripts

All scripts are defined in `package.json`:

- `npm install` — Install npm dependencies
- `npm run dev` — Start the Vite development server (`http://localhost:5173`)
- `npm run test` (or `npm test`) — Run Vitest test suites (`vitest run`)
- `npm run lint` — Run Oxlint across `src/`
- `npm run build` — Typecheck with `tsc -b` and build the production bundle into `dist/`
- `npm run preview` — Preview the production bundle locally

## Routing & Deployment Notes

- Client-side routes live in `src/App.tsx` (protected via `RequireAuth`).
- `public/_redirects` provides `/* /index.html 200` SPA fallback rules copied into `dist/` during `npm run build`.
