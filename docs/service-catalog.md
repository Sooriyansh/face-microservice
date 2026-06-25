# Service Catalog

| Service | Runtime | Port | Health | Main Dependencies |
| --- | --- | ---: | --- | --- |
| api-gateway | Node.js | 8080 | `/health/ready` | Redis, Auth Service |
| auth-service | Node.js | 8081 | `/health/ready` | MongoDB |
| student-service | Node.js | 8082 | `/health/ready` | MongoDB, broker |
| attendance-service | Node.js | 8083 | `/health/ready` | MongoDB, broker |
| notification-service | Node.js | 8084 | `/health/ready` | MongoDB, broker, email/SMS provider |
| activity-timeline-service | Node.js | 8085 | `/health/ready` | MongoDB, broker |
| reporting-service | Node.js | 8086 | `/health/ready` | MongoDB read models, MinIO/S3 |
| audit-log-service | Node.js | 8087 | `/health/ready` | MongoDB, broker |
| analytics-service | Node.js/Python | 8088 | `/health/ready` | broker, analytics database |
| file-storage-service | Node.js | 8089 | `/health/ready` | MinIO/S3 |
| face-capture-service | Python | 8091 | `/health/ready` | OpenCV, MinIO/S3, broker |
| face-training-service | Python | 8092 | `/health/ready` | TensorFlow, MongoDB, MinIO/S3, broker |
| face-recognition-service | Python | 8093 | `/health/ready` | OpenCV, TensorFlow, MongoDB, MinIO/S3, broker |
| system-event-monitoring-service | Python | 8094 | `/health/ready` | Windows Event Viewer, MongoDB, broker |
| dashboard-service | Next.js | 3000 | `/api/health` | API Gateway |

