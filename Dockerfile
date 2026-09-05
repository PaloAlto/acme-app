# The app as a container: Node runs server.ts from source, nothing to install.
FROM node:24-bookworm-slim
WORKDIR /app
COPY server.ts ./
COPY src ./src
ARG ACME_COMMIT_SHA=unknown
ENV ACME_COMMIT_SHA=$ACME_COMMIT_SHA
ENV HOST=0.0.0.0 PORT=8789
EXPOSE 8789
USER node
CMD ["node", "server.ts"]
