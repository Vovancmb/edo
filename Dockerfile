FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils python3 make g++ ca-certificates \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

ENV DATA_DIR=/data
ENV PORT=3000
ENV NODE_ENV=production

RUN mkdir -p /data/uploads /data/previews

EXPOSE 3000
CMD ["node", "server.js"]
