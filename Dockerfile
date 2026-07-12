FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM dependencies AS builder
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build:offline

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    CATALOG_PATH=/app/generated/catalog.json \
    CORS_ORIGIN=*
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn workspaces focus --production && yarn cache clean
COPY --from=builder /app/dist ./dist
COPY generated/catalog.json ./generated/catalog.json
RUN chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server/main.js"]
