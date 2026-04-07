# --- Stage 1: Build ---
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies first (for caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Stage 2: Runtime ---
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need from builder
COPY --from=builder /app/package*.json ./
# Copy necessary app files (firebase, etc)
COPY --from=builder /app/firebase-service-account.json ./
COPY --from=builder /app/dist ./dist

# Install production-only dependencies
RUN npm ci --omit=dev

# Expose API port
EXPOSE 4000

CMD ["npm", "start"]

