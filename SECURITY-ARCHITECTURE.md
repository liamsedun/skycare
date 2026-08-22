# SkyCare Security Architecture

## Defense-in-Depth Overview

Internet -> Cloudflare (WAF+DDoS+Bot) -> Netlify (CDN) -> Next.js Proxy (Abuse+Auth) -> API (Rate Limit+RLS) -> Supabase (DB Isolation)

## Implemented Controls

### 1. Security Headers (next.config.ts)
- HSTS: max-age=63072000, includeSubDomains, preload
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Content-Security-Policy: strict self-only with specific allowlists
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera, microphone, geolocation, payment all disabled
- X-Powered-By: removed

### 2. Rate Limiting (lib/rate-limit.ts)
- Standard API: 100 req/min per IP
- Auth endpoints: 10 req/min per IP
- Identifier resolution: 20 req/min per IP
- File uploads: 10 req/min per IP
- Payment: 20 req/min per IP
- Webhooks: 100 req/min per IP

### 3. Login Lockout
- 5 failed attempts per identifier+IP in 15 minutes triggers lockout
- Lockout lasts 15 minutes
- Resets on successful login
- All failures logged to security_events

### 4. Abuse Detection (proxy.ts)
- Suspicious UA blocking (sqlmap, nikto, nmap, etc.)
- Progressive escalation: allow -> throttle -> challenge -> block
- Thresholds: 50/suspicious, 200/highly_suspicious, 1000/attack

### 5. Patient Enumeration Prevention
- Unified error messages on resolve-identifier
- Same error for invalid, no-portal-login, and missing patients

### 6. Request Body Limits
- 1MB max for all JSON bodies via parseBody()

### 7. CORS
- No CORS headers set (secure by default)

### 8. Image SSRF Prevention
- Scoped image.remotePatterns (no wildcard)

## Required External Setup (Cloudflare)

### DNS
- Point skycare.app and *.skycare.app to Netlify

### WAF Rules
- Block: sqlmap, nikto, dirbuster, gobuster, nmap, masscan
- Challenge: scrapy, python-requests, go-http-client
- Rate limit: /api/auth/* at 10/min, /api/payments/* at 20/min

### DDoS
- Always-on L3/L4/L7 DDoS mitigation (included in Cloudflare plans)

## Incident Response

### DDoS Attack
1. Detection: Cloudflare dashboard traffic spike
2. Alerting: Automatic Cloudflare alerts
3. Triage: Check if legitimate spike
4. WAF: Verify rules active
5. Rate limit: Escalate Cloudflare rules
6. Block: Add IP-specific blocks
7. Escalate: Contact Netlify/Cloudflare support

### Data Breach
1. Contain: Rotate all secrets
2. Investigate: Check audit_logs and security_events
3. Notify: Report to affected tenants
4. Remediate: Fix vulnerability
5. Review: Post-incident analysis

## Backup and Recovery
- Supabase: Daily backups, point-in-time recovery available
- Storage: Redundant across Supabase infrastructure
- Deployment: Git-based rollback via GitHub
- Migrations: All recorded in backend/supabase/migrations/

## Payment Security
- HMAC-SHA512 signature verification on webhooks
- Constant-time comparison (timingSafeEqual)
- Per-tenant webhook secrets
- Idempotent payment recording
- Server-side amount verification

## File Upload Security
- MIME type allowlist per upload type
- Size limits: 2-3 MB per type
- Server-generated file paths (no user-controlled filenames in paths)
- Storage RLS policies for tenant isolation
