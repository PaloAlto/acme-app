# The app as a container: Node runs server.ts from source, nothing to install.
FROM node:24-bookworm-slim
WORKDIR /app
COPY server.ts ./
COPY src ./src
ENV HOST=0.0.0.0 PORT=8789
EXPOSE 8789
USER node
CMD ["node", "server.ts"]
