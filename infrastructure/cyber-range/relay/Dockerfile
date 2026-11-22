# Fixed-destination relay: only the Docker host loopback binds the published port.
FROM node:22.13.1-alpine3.21
WORKDIR /opt/eternyx-relay
COPY --chown=10001:10001 server.mjs ./server.mjs
USER 10001:10001
ENV NODE_ENV=production
ENV PORT=8081
EXPOSE 8081
CMD ["node", "/opt/eternyx-relay/server.mjs"]
