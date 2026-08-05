FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder /app/dist ./dist
COPY schema.sql ./schema.sql
COPY migrations ./migrations
COPY scripts/migrate.mjs scripts/migration-lib.mjs ./scripts/
EXPOSE 3002
CMD ["node", "dist/index.js"]
