FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN NODE_ENV=development npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# Copy migration files that tsc doesn't handle
RUN cp -r src/db/migrations dist/db/migrations

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 fastify
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package.json ./
USER fastify
EXPOSE 3000
CMD ["node", "dist/index.js"]
