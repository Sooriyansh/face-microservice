FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
ENV SERVICE_NAME=system-events-service
EXPOSE 8094
CMD ["node", "services/system-events-service/src/server.js"]

