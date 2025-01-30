FROM node:18-alpine

RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /tmp/uploads && \
    chown -R appuser:appgroup /tmp/uploads

WORKDIR /app/bot
USER appuser

COPY package*.json ./
RUN npm install --production
COPY . .

CMD ["node", "bot.js"]