# SkyCare frontend — production image
# Builds the Next.js app, then serves it with `next start` on port 3000.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Served behind a reverse proxy at runtime; images are external (Supabase
# Storage) so the image-optimizer has nothing local to optimize. Inlining the
# scripts disables next/image runtime optimization over the network.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PRIVATE_STANDALONE=false
# Provide placeholders so the build does not fail without secrets; real values
# are injected at runtime via the host environment / secrets manager. Keep the
# App Router pages dynamic so env is read per-request.
RUN cp .env.example .env.local
RUN npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]