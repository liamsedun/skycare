# MiMo Configuration — SkyCare HMS

**Date:** August 22, 2026  
**Purpose:** MiMo model configuration for SkyCare HMS development

---

## Model Identity

- **Model:** MiMo (mimo-v2.5-free via OpenCode)
- **Role:** AI coding assistant for SkyCare HMS SaaS
- **Platform:** OpenCode CLI
- **Strengths:** File editing, search, multi-step tasks, bash execution

---

## Session Context

### Project
- **Name:** SkyCare — The Smart Hospital OS for Africa
- **Repo:** `C:\Users\Admin\Downloads\skycare--saas-hosp`
- **Frontend:** `C:\Users\Admin\Downloads\skycare--saas-hosp\frontend`
- **Backend:** `C:\Users\Admin\Downloads\skycare--saas-hosp\backend\supabase`

### Environment
- **OS:** Windows (win32)
- **Shell:** PowerShell 5.1
- **Node.js:** LTS
- **Package Manager:** npm

---

## System Instructions

### Critical Rules
1. **NEVER read/write/reference the Life Blossom folder** — it's a separate project
2. **Workdir for frontend:** `C:\Users\Admin\Downloads\skycare--saas-hosp\frontend`
3. **Git root:** `C:\Users\Admin\Downloads\skycare--saas-hosp`
4. **PowerShell:** Use `; if ($?)` instead of `&&`
5. **Start-Process:** Use `-ArgumentList` for args with spaces

### Build Commands
```powershell
# From frontend directory
cd C:\Users\Admin\Downloads\skycare--saas-hosp\frontend
npm run build          # Production build
npx tsc --noEmit       # Type check
npm run lint           # ESLint
npm test               # Vitest

# Restart prod
Get-NetTCPConnection -LocalPort 3000 | Select -ExpandProperty OwningProcess -Unique | Stop-Process -Force
Start-Process node -ArgumentList "node_modules\next\dist\bin\next","start","-p","3000"
```

### Database Commands
```powershell
# From backend/supabase directory
cd C:\Users\Admin\Downloads\skycare--saas-hosp\backend\supabase
npx supabase db push          # Apply migrations
npx supabase migration list   # List migrations
```

---

## File Operations

### Read Files
- Use `Read` tool for file content
- Use `Glob` for pattern matching
- Use `Grep` for content search

### Edit Files
- Use `Edit` tool for string replacements
- Use `Write` tool for new files
- Always read first before editing

### Bash Commands
- Use `Bash` tool for shell commands
- Always explain what the command does
- Check directory existence before creating files

---

## Daily Brief Template

```markdown
## SkyCare HMS — Morning Brief [DATE]

### Build Status
- [PASS/FAIL] `npm run build`
- [PASS/FAIL] `npx tsc --noEmit`
- [PASS/FAIL] `npm run lint`
- [N/N] `npm test`

### Recent Completions
- [Item 1 from AGENTS.md]
- [Item 2 from AGENTS.md]

### Active Work
- [Current task]

### Blockers
- [Any blockers]

### Today's Plan
- [Planned tasks]

### Health Metrics
- Migrations: [N] applied
- API routes: [N]+ endpoints
- Test coverage: ~[N]%
```

---

## MiMo-Specific Patterns

### Multi-Step Tasks
1. Read the relevant files first
2. Understand the existing patterns
3. Make changes following conventions
4. Verify with build/typecheck
5. Document in AGENTS.md if significant

### File Search Strategy
1. Start with `Glob` for file patterns
2. Use `Grep` for content search
3. Read files for context
4. Edit with precision

### Error Handling
1. Check build output
2. Check TypeScript errors
3. Check ESLint warnings
4. Fix issues one at a time
5. Verify after each fix

---

## Session Management

### Working Directory
Always use explicit paths or `workdir` parameter:
```
workdir: C:\Users\Admin\Downloads\skycare--saas-hosp\frontend
```

### File Paths
- Use Windows paths: `C:\Users\Admin\Downloads\...`
- Use forward slashes in code: `src/app/page.tsx`
- Quote paths with spaces

### Git Operations
```powershell
cd C:\Users\Admin\Downloads\skycare--saas-hosp
git status
git add .
git commit -m "message"
git push
```
