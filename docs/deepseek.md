# DeepSeek Configuration — SkyCare HMS

**Date:** August 22, 2026  
**Purpose:** DeepSeek model configuration for SkyCare AI assistant

---

## Model Identity

- **Model:** DeepSeek (deepseek-chat / deepseek-reasoner)
- **Role:** Primary AI assistant for SkyCare HMS SaaS development
- **Context Window:** 128K tokens (deepseek-chat), 64K (deepseek-reasoner)
- **Strengths:** Code generation, architecture design, debugging, documentation

---

## System Instructions

When working on SkyCare HMS:

### Always Reference
- `AGENTS.md` at repo root — canonical project state, gotchas, work history
- `docs/PR.md` — Product requirements and completion status
- `docs/architectural.md` — Full architecture document
- `docs/architectural-essentials.md` — Quick reference for patterns

### Key Rules
1. **Never read/write/reference the Life Blossom folder** (`C:\Users\Admin\Downloads\life-blossom-hosp`) for SkyCare work
2. **Workdir for frontend commands:** `frontend\`
3. **Commit + push** per approved stage plan
4. **Gate:** `npx tsc --noEmit` 0, lint 0 errors, `npm run build` 0, `npm test` 206+/206+
5. **Git repo root is the workspace root** (`skycare--saas-hosp`), not `frontend`

### Code Style
- No comments unless asked
- No `@/lib/utils` — `cn` is in `mobile-app-ui.tsx`
- Use theme tokens, not hardcoded colors
- `withAuth`/`withStaff` on every API route
- `requireTenant(ctx)` for tenant isolation
- `ok(data)` envelope for all responses
- `ApiError` family for errors

### Daily Brief Format
When giving morning briefs:
```
## SkyCare HMS — Daily Brief [DATE]

### Status
- Build: [PASS/FAIL]
- Tests: [N/N passing]
- Lint: [0 errors, ~602 warnings]
- Last commit: [hash] [message]

### Completed (Recent)
- [List recent completions from AGENTS.md]

### In Progress
- [List active items]

### Blocked
- [List blockers if any]

### Next Steps
- [List planned work]

### Health Metrics
- Migrations applied: [N]
- API routes: [N+]
- Pages: [N+]
- Test coverage: ~[N]%
```

---

## DeepSeek-Specific Prompts

### For Code Generation
```
Generate code for SkyCare HMS following these patterns:
- API routes: withAuth/withStaff wrapper, requireTenant, ok() envelope
- Components: theme tokens, dark mode support, mobile-first
- Database: service client with tenant_id filter
- Tests: Vitest with real Supabase client
```

### For Debugging
```
Debug this SkyCare HMS issue:
1. Check AGENTS.md known gotchas first
2. Verify tenant_id isolation
3. Check RLS policies
4. Verify JWT claims
5. Check API layer guards
```

### For Architecture Decisions
```
For SkyCare HMS architecture decisions:
1. Reference docs/architectural.md
2. Follow existing patterns
3. Maintain tenant isolation
4. Use existing libs (don't reinvent)
5. Document in AGENTS.md
```

---

## Model Configuration

```json
{
  "model": "deepseek-chat",
  "temperature": 0.7,
  "max_tokens": 4096,
  "top_p": 0.95,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "system_prompt": "You are the SkyCare HMS AI assistant. Follow AGENTS.md strictly. Never reference Life Blossom. Work from frontend\\ directory. Always verify builds pass before committing."
}
```
