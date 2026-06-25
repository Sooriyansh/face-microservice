FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=api-gateway
EXPOSE 8080
CMD ["node", "services/api-gateway/src/server.js"]

