FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 UPLOAD_DIR=/app/uploads
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY database ./database
COPY scripts/migrate.mjs ./scripts/migrate.mjs
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
