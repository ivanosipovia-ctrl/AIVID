# chromium + системные библиотеки уже внутри образа, sudo не нужен
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js automation.js keys_store.js ./
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
