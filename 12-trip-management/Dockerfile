FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 3010

CMD ["dumb-init", "node", "run-server.js"]
