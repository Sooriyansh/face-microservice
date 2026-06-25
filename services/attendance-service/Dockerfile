FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=attendance-service
EXPOSE 8083
CMD ["node", "services/attendance-service/src/server.js"]

