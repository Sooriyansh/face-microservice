FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=student-service
EXPOSE 8082
CMD ["node", "services/student-service/src/server.js"]

