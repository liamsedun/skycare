# SkyCare HMS — AI Agent Configuration

**Date:** August 22, 2026  
**Purpose:** Agent instructions for SkyCare HMS SaaS development

---

## Agent Roles

### 1. Development Agent
**Focus:** Code generation, debugging, feature implementation  
**Files:** `AGENTS.md`, `docs/architectural.md`, `docs/architectural-essentials.md`

### 2. Architecture Agent
**Focus:** System design, technical decisions, documentation  
**Files:** `docs/architectural.md`, `docs/architectural-essentials.md`, `SECURITY-ARCHITECTURE.md`

### 3. Testing Agent
**Focus:** Test writing, coverage, smoke tests  
**Files:** `frontend/vitest.config.ts`, `frontend/src/**/*.test.ts`

### 4. Documentation Agent
**Focus:** README, CHANGELOG, API docs, user guides  
**Files:** `README.md`, `CHANGELOG.md`, `docs/*.md`

### 5. DevOps Agent
**Focus:** CI/CD, deployment, infrastructure  
**Files:** `.github/workflows/`, `docs/deployment.md`

---

## Agent Instructions

### All Agents
1. **NEVER read/write/reference the Life Blossom folder** — it's a separate project
2. **Always reference AGENTS.md** — it's the canonical project state
3. **Follow existing patterns** — don't reinvent the wheel
4. **Document significant changes** — update AGENTS.md, CHANGELOG.md
5. **Verify before committing** — build, typecheck, lint, test

### Development Agent
```
When implementing features:
1. Read AGENTS.md for current state
2. Read docs/architectural.md for patterns
3. Read existing similar code for conventions
4. Implement following patterns
5. Write tests
6. Verify build passes
7. Update documentation
```

### Architecture Agent
```
When making architecture decisions:
1. Read docs/architectural.md for current architecture
2. Read SECURITY-ARCHITECTURE.md for security patterns
3. Consider multi-tenancy implications
4. Consider RLS implications
5. Document decision in ADR or AGENTS.md
```

### Testing Agent
```
When writing tests:
1. Read frontend/vitest.config.ts for coverage thresholds
2. Read existing tests for patterns
3. Use real Supabase client (not mocks)
4. Test tenant isolation
5. Test role-based access
6. Verify coverage improves
```

### Documentation Agent
```
When updating docs:
1. Read existing docs for style
2. Keep docs accurate to codebase
3. Include examples
4. Update README.md for major changes
5. Update CHANGELOG.md for all changes
```

### DevOps Agent
```
When working on CI/CD:
1. Read .github/workflows/ for current pipeline
2. Read docs/deployment.md for deployment process
3. Maintain lint → typecheck → test → build order
4. Keep coverage gate at ≥25% statements
5. Document deployment steps
```

---

## Agent Communication

### Daily Brief Format
All agents should be able to generate a daily brief:
```
## SkyCare HMS — Daily Brief [DATE]

### Build Status
- [PASS/FAIL] npm run build
- [PASS/FAIL] npx tsc --noEmit
- [PASS/FAIL] npm run lint
- [N/N] npm test

### Completed (Last 24h)
- [List completions]

### In Progress
- [List active work]

### Blocked
- [List blockers]

### Next Steps
- [List planned work]

### Health Metrics
- Migrations: [N]
- API routes: [N]+
- Test coverage: ~[N]%
```

### Handoff Format
When one agent hands off to another:
```
## Handoff: [Agent A] → [Agent B]

### Context
- What was being worked on
- What was completed
- What's remaining

### Files Affected
- [List files]

### Next Steps
- [Specific tasks for Agent B]

### Notes
- [Any important notes]
```

---

## Agent Tools

### Available Tools
- **Bash** — Shell commands (PowerShell on Windows)
- **Read** — Read file content
- **Write** — Create/overwrite files
- **Edit** — String replacements in files
- **Glob** — File pattern matching
- **Grep** — Content search
- **Task** — Launch sub-agents
- **WebFetch** — Fetch web content
- **WebSearch** — Search the web
- **Skill** — Load specialized skills

### Tool Usage Rules
1. **Bash:** Always explain what the command does
2. **Read:** Always read before editing
3. **Edit:** Provide unique oldString for replacements
4. **Glob/Grep:** Use for finding files and content
5. **Task:** Use for complex multi-step work
6. **WebFetch/WebSearch:** Use for research

---

## Agent Knowledge Base

### Key Documents
| Document | Purpose | When to Read |
|----------|---------|--------------|
| `AGENTS.md` | Canonical project state | Always, first |
| `docs/PR.md` | Product requirements | When understanding features |
| `docs/architectural.md` | Architecture overview | When making design decisions |
| `docs/architectural-essentials.md` | Quick reference | When coding |
| `SECURITY-ARCHITECTURE.md` | Security patterns | When implementing security |
| `README.md` | Project overview | When starting |
| `CHANGELOG.md` | Change history | When documenting changes |

### Key Files
| File | Purpose |
|------|---------|
| `frontend/src/lib/auth.ts` | JWT claims, roles |
| `frontend/src/lib/api-utils.ts` | API wrappers |
| `frontend/src/lib/rate-limit.ts` | Rate limiting |
| `frontend/src/lib/cache.ts` | Caching |
| `frontend/src/lib/tenant.ts` | Tenant loading |
| `frontend/src/lib/nav.ts` | Navigation |
| `frontend/src/proxy.ts` | Abuse detection |

---

## Agent Constraints

### Code Style
- No comments unless explicitly asked
- Use existing libraries (don't add new ones without checking)
- Follow existing naming conventions
- Use theme tokens, not hardcoded colors
- Mobile-first responsive design

### Security
- Never log secrets
- Never commit secrets
- Always use `withAuth`/`withStaff`
- Always filter by `tenant_id`
- Never trust client input

### Testing
- Test tenant isolation
- Test role-based access
- Use real Supabase client
- Clean up test data

### Documentation
- Keep docs accurate
- Include examples
- Update when code changes
- Document decisions
