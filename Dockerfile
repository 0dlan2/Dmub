FROM node:18-alpine

WORKDIR /app/bot

COPY package*.json ./

RUN npm install --production && \
    mkdir -p uploads && \
    chown -R node:node uploads

COPY . .

USER node

CMD ["node", "bot.js"]