# Deployment Guide

## Local Microservices

```bash
docker compose -f infra/docker-compose.microservices.yml up --build
```

API Gateway:

```text
http://localhost:8080
```

RabbitMQ dashboard:

```text
http://localhost:15672
```

MinIO dashboard:

```text
http://localhost:9001
```

## Kubernetes

Build and push service images using the Dockerfiles in `services/*/Dockerfile`, then apply the base:

```bash
kubectl apply -k infra/k8s/base
```

Create service secrets before deploying production workloads:

```bash
kubectl -n face-attendance create secret generic auth-service-secrets --from-literal=mongo-uri="mongodb://..." --from-literal=auth-secret="change-me"
kubectl -n face-attendance create secret generic student-service-secrets --from-literal=mongo-uri="mongodb://..."
kubectl -n face-attendance create secret generic attendance-service-secrets --from-literal=mongo-uri="mongodb://..."
kubectl -n face-attendance create secret generic notification-service-secrets --from-literal=mongo-uri="mongodb://..."
kubectl -n face-attendance create secret generic system-events-service-secrets --from-literal=mongo-uri="mongodb://..."
kubectl -n face-attendance create secret generic analytics-service-secrets --from-literal=mongo-uri="mongodb://..."
kubectl -n face-attendance create secret generic audit-service-secrets --from-literal=mongo-uri="mongodb://..."
```
