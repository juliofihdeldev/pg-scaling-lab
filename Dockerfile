FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY db.js index.js partitions.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "index.js"]
