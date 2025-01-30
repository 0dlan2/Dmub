FROM node:18-alpine

RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup

WORKDIR /app/bot
USER appuser

COPY package*.json ./
RUN npm ci --production
COPY . .

CMD ["node", "bot.js"]
