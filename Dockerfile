# ---- AI trust study platform (Job Quest + Care Quest) ----
# Small, single-stage image. The app has no native dependencies (file-based
# store + Express), so no compiler toolchain is needed and the image is tiny.
FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json ./
RUN npm install --omit=dev

# App source.
COPY src ./src
COPY public ./public

# Study data lives here; mount a volume at /app/data to persist across restarts.
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/study.json
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Simple healthcheck used by most orchestrators.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
