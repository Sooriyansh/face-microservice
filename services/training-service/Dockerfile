FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY python/requirements-render.txt ./python/requirements-render.txt
RUN pip3 install --break-system-packages --no-cache-dir -r python/requirements-render.txt
COPY . .
ENV SERVICE_NAME=training-service
ENV PYTHON_EXECUTABLE=python3
EXPOSE 8092
CMD ["node", "services/training-service/src/server.js"]

