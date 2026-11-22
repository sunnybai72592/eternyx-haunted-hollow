# Local-only ETERNYX training target. Not a production Docker image.
# Pin the image to an audited immutable digest before any hosted deployment.
FROM node:22.13.1-alpine3.21
WORKDIR /opt/eternyx-range
COPY --chown=10001:10001 server.mjs ./server.mjs
USER 10001:10001
ENV NODE_ENV=production
ENV PORT=8080
ENV RANGE_MAX_AGE_SECONDS=1800
EXPOSE 8080
CMD ["node", "/opt/eternyx-range/server.mjs"]
