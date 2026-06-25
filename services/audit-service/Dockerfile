FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=audit-service
EXPOSE 8087
CMD ["node", "services/audit-service/src/server.js"]

