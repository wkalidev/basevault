FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY keeper.mjs .
CMD ["node", "keeper.mjs"]
