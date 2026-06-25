FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=auth-service
EXPOSE 8081
CMD ["node", "services/auth-service/src/server.js"]

