FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=analytics-service
EXPOSE 8088
CMD ["node", "services/analytics-service/src/server.js"]

