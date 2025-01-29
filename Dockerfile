FROM node:18-alpine
WORKDIR /app/bot
COPY bot/package*.json ./
RUN npm install
COPY bot/ ./
CMD ["node", "bot.js"]
