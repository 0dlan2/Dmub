FROM node:18-alpine
WORKDIR /app/bot
COPY bot/package*.json ./
COPY bot/bot.js ./
RUN npm install --production
RUN mkdir -p uploads && chown -R node:node uploads
COPY bot/ ./
USER node
CMD ["node", "bot.js"]