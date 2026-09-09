FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Database schema initialization is a release-time operation. Set this to
# true only for a deliberate one-off schema initialization deployment.
ENV DB_INIT_ON_START=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/shared ./shared
COPY --from=build /app/init.sql ./init.sql

EXPOSE 3000
CMD ["sh", "-c", "if [ \"$DB_INIT_ON_START\" = \"true\" ]; then node scripts/init-db.js || exit $?; fi; node scripts/migrate-db.js || exit $?; exec node dist/server/main.js"]
