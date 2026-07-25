FROM node:24-bookworm-slim

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --chown=node:node . .

RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV ORCHESTRATOR_HOST=0.0.0.0
ENV PORT=8080
ENV DATA_DIRECTORY=/app/data
ENV DATABASE_PATH=/app/data/ai-corner-renewal.sqlite
ENV PRIVATE_MEDIA_DIRECTORY=/app/data/private-media
ENV STATIC_DIRECTORY=/app/apps/douyin-demo/douyin-static-demo
ENV LEGACY_ASSET_DIRECTORY=/app/apps/web/assets
ENV FIXTURE_DIRECTORY=/app/examples/responses

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/health`).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["npm", "run", "start:production"]
