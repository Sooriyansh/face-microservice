FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=notification-service
EXPOSE 8084
CMD ["node", "services/notification-service/src/server.js"]

