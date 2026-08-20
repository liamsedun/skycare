# Contributing

SkyCare is developed on `main` with feature branches for larger work. PRs are
gated by CI (lint, typecheck, tests, build) and by a manual review.

## Setup

1. Clone the repo.
2. `cd frontend && cp .env.example .env.local` and fill in your keys.
3. `npm install`.

## Development loop

- Write code, then run the quality gate locally before pushing:

  ```bash
  npm run lint       # ESLint — 0 errors required
  npm run typecheck  # tsc --noEmit
  npm test           # Vitest (unit + component)
  npm run build      # Next production build
  ```

- Follow existing conventions: `withAuth`/`withStaff` on every API route,
  service-client queries filtered by `tenant_id = requireTenant(ctx)`, camelCase
  API bodies, snake_case DB columns, `ok()`/`okPaginated()` envelopes.

## Tests

- New logic in `frontend/src/lib` should ship with a co-located `*.test.ts`.
- New UI primitives in `frontend/src/components` should ship with a `*.test.tsx`
  (React Testing Library + mocked `fetch`).
- Coverage runs in CI with a 30% global statement threshold — don't let it regress.

## Database migrations

- Add versioned SQL under `backend/supabase/migrations/`.
- Apply to the linked project with `npx supabase db push` (run from
  `backend/supabase`).
- Recheck the RLS surface after any table/function change: new SECURITY DEFINER
  functions are PUBLIC-EXECUTE by default — revoke before granting.

## Committing

Write focused commits in the repo's style, e.g. `feat(hr): ...`, `fix(billing): ...`,
`refactor(pharmacy): ...`, `test(components): ...`.

## Reporting issues

File issues with a reproduction path. Include the tenant slug/role you were
testing as if you were someone else debugging it cold.