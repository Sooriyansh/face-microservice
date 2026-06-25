# Enterprise Microservices Architecture

This document redesigns the current Face Recognition Attendance Management System from a single Express + Python application into independently deployable services. The existing monolith should remain operational while capabilities are extracted one domain at a time.

## Target Architecture

```text
Browser / Mobile Clients
        |
        v
API Gateway / Ingress
        |
        +-- Auth Service
        +-- Student Service
        +-- Attendance Service
        +-- Dashboard Service
        +-- Reporting Service
        +-- Activity Timeline Service
        |
        +--------------------+
                             |
                             v
                      Message Broker
                   RabbitMQ or Kafka
                             |
        +--------------------+--------------------+
        |                    |                    |
        v                    v                    v
Face Capture Service  Face Training Service  Face Recognition Service
        |                    |                    |
        v                    v                    v
File Storage Service  Model Storage           Recognition Events

Cross-cutting services:
Auth, Audit Log, Notification, Analytics, Observability, Service Discovery
```

## Core Principles

- Each service owns one business capability and can be deployed independently.
- Each service owns its own database or storage boundary.
- Synchronous REST is used for query-style or immediate command flows.
- Asynchronous events are used for side effects, analytics, reports, notifications, model training, and audit logs.
- Services expose health endpoints: `GET /health/live` and `GET /health/ready`.
- Internal APIs require service-to-service authentication.
- Business rules live in application/domain layers, not route handlers.
- Database access is isolated behind repositories.

## Domain Boundaries

| Service | Bounded Context | Primary Responsibility | Database / Storage |
| --- | --- | --- | --- |
| API Gateway | Edge | Routing, JWT validation, rate limiting, request correlation | Redis for rate limit state |
| Authentication Service | Identity | Users, roles, tokens, password reset | MongoDB |
| Student Service | Student Registry | Student profile, face label, search | MongoDB |
| Face Capture Service | Dataset Capture | Camera ingestion, image validation, sample capture | MinIO/S3 |
| Face Training Service | Model Training | Embeddings, model versions, training jobs | MongoDB + MinIO/S3 |
| Face Recognition Service | Recognition | Real-time matching, confidence scoring, recognition events | MongoDB for metadata, MinIO/S3 for models |
| Attendance Service | Attendance | Mark attendance, duplicate prevention, history, reports query model | MongoDB |
| Notification Service | Notification | Email, SMS, push, admin alerts | MongoDB |
| System Event Monitoring Service | Device Events | Windows event capture and normalization | MongoDB |
| Activity Timeline Service | Timeline | Daily event timeline and activity reports | MongoDB |
| Dashboard Service | UI | Admin, employee, attendance, activity dashboards | None or Redis cache |
| File Storage Service | Storage | Pre-signed upload/download, storage policies | MinIO/S3 |
| Reporting Service | Reports | PDF, Excel, scheduled exports | MongoDB read models + MinIO/S3 |
| Audit Log Service | Audit | Immutable audit records for every action | MongoDB or append-only log store |
| Analytics Service | Analytics | Attendance, recognition, usage metrics | MongoDB/ClickHouse/TimescaleDB |

## Service API Summary

### API Gateway

- `GET /health/live`
- `GET /health/ready`
- Routes external traffic to internal service URLs.
- Validates JWTs for protected endpoints.
- Injects `x-correlation-id`, `x-user-id`, `x-user-role`.
- Enforces rate limits per IP, user, and route.

Suggested routes:

| External Path | Internal Service |
| --- | --- |
| `/api/auth/*` | Authentication Service |
| `/api/students/*` | Student Service |
| `/api/attendance/*` | Attendance Service |
| `/api/face/capture/*` | Face Capture Service |
| `/api/face/training/*` | Face Training Service |
| `/api/face/recognition/*` | Face Recognition Service |
| `/api/system-events/*` | System Event Monitoring Service |
| `/api/timeline/*` | Activity Timeline Service |
| `/api/reports/*` | Reporting Service |
| `/api/notifications/*` | Notification Service |

### Authentication Service

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `GET /auth/me`
- `POST /auth/roles/assign`

Domain rules:

- Passwords are hashed with bcrypt or Argon2.
- JWT contains user id, role, token version, and expiry.
- Refresh tokens are stored hashed.
- Role changes publish `auth.user-role-changed`.

### Student Service

- `POST /students`
- `GET /students`
- `GET /students/{studentId}`
- `PATCH /students/{studentId}`
- `DELETE /students/{studentId}`
- `GET /students/search?q=`
- `PATCH /students/{studentId}/face-label`

Domain rules:

- `faceLabel` is unique and stable once training data exists.
- Student deletion should be soft delete when attendance history exists.
- Emits `student.created`, `student.updated`, `student.face-label-changed`, `student.deleted`.

### Face Capture Service

- `POST /capture/sessions`
- `POST /capture/sessions/{sessionId}/frames`
- `POST /capture/sessions/{sessionId}/complete`
- `GET /capture/sessions/{sessionId}`

Domain rules:

- Validates image size, face count, blur, brightness, and spoofing checks.
- Stores accepted face samples through File Storage Service.
- Emits `face.dataset-captured`.

### Face Training Service

- `POST /training/jobs`
- `GET /training/jobs/{jobId}`
- `GET /training/models/latest`
- `POST /training/models/{modelVersion}/activate`

Domain rules:

- Training job consumes dataset metadata, generates embeddings, stores model artifacts.
- Model activation is explicit and versioned.
- Emits `face.training-started`, `face.training-completed`, `face.training-failed`, `face.model-activated`.

### Face Recognition Service

- `POST /recognition/scan`
- `POST /recognition/compare`
- `GET /recognition/events`

Domain rules:

- Loads active model version from model storage.
- Returns label, confidence, bounding box, quality score, and model version.
- Emits `face.recognized` or `face.not-recognized`.
- Does not directly write attendance.

### Attendance Service

- `POST /attendance/mark`
- `POST /attendance/mark-from-recognition`
- `GET /attendance?date=YYYY-MM-DD`
- `GET /attendance/students/{studentId}`
- `GET /attendance/reports/daily`
- `GET /attendance/reports/monthly`

Domain rules:

- Prevents duplicate attendance with a unique compound index on `studentId + dateKey`.
- Accepts recognition evidence but owns the decision to mark present.
- Emits `attendance.marked`, `attendance.duplicate-detected`, `attendance.corrected`.

### System Event Monitoring Service

- `POST /system-events/ingest`
- `GET /system-events?date=YYYY-MM-DD`
- `GET /system-events/devices/{deviceId}`

Domain rules:

- Normalizes Windows Event Viewer events into business event names.
- Tracks startup, shutdown, restart, sleep, wakeup, lock, unlock, login, logout.
- Emits `system-event.recorded`.

### Activity Timeline Service

- `GET /timeline/daily?date=YYYY-MM-DD`
- `GET /timeline/users/{userId}`
- `GET /timeline/analytics`

Domain rules:

- Builds chronological daily timeline from attendance and system events.
- Should consume events and maintain a read-optimized timeline collection.

## Event Catalog

All events use this envelope:

```json
{
  "eventId": "uuid",
  "eventType": "attendance.marked",
  "eventVersion": 1,
  "occurredAt": "2026-06-25T12:00:00.000Z",
  "correlationId": "uuid",
  "producer": "attendance-service",
  "payload": {}
}
```

| Event | Producer | Consumers |
| --- | --- | --- |
| `student.created` | Student Service | Audit, Analytics, Dashboard |
| `student.face-label-changed` | Student Service | Face Training, Audit |
| `face.dataset-captured` | Face Capture | Face Training, Audit |
| `face.training-completed` | Face Training | Face Recognition, Notification, Audit |
| `face.model-activated` | Face Training | Face Recognition, Audit |
| `face.recognized` | Face Recognition | Attendance, Analytics, Audit |
| `face.not-recognized` | Face Recognition | Analytics, Audit |
| `attendance.marked` | Attendance | Notification, Timeline, Reporting, Analytics, Audit |
| `attendance.duplicate-detected` | Attendance | Audit, Analytics |
| `system-event.recorded` | System Event Monitoring | Timeline, Analytics, Audit |
| `notification.sent` | Notification | Audit |
| `report.generated` | Reporting | Notification, Audit |

## Clean Architecture Layout

Use the same structure for Node.js and Python services:

```text
service-name/
  src/
    domain/
      entities/
      value-objects/
      events/
      services/
    application/
      commands/
      queries/
      use-cases/
      ports/
    infrastructure/
      database/
      messaging/
      storage/
      auth/
      observability/
    interfaces/
      http/
      consumers/
      schedulers/
  tests/
  Dockerfile
  README.md
```

Dependency direction:

```text
interfaces -> application -> domain
infrastructure -> application ports
domain -> no framework dependencies
```

## Database Ownership

- No service reads or writes another service database.
- Cross-service data is exchanged through APIs or events.
- Reporting, analytics, and dashboard views should use read models populated from events.
- MongoDB indexes should enforce key business invariants, especially duplicate attendance prevention.

Attendance duplicate index:

```js
db.attendance.createIndex({ studentId: 1, dateKey: 1 }, { unique: true })
```

## Security

- External requests enter only through the API Gateway.
- JWTs are issued by Auth Service.
- Internal service calls use mTLS or signed service tokens.
- Use RBAC roles: `admin`, `employee`, `teacher`, `auditor`, `service`.
- Sensitive configuration is loaded from Kubernetes Secrets.
- Audit Service records authentication, authorization, data mutation, training, recognition, and report generation actions.

## Observability

- Structured JSON logs in every service.
- Propagate `x-correlation-id` across REST and event messages.
- Use OpenTelemetry for traces.
- Prometheus scrapes `/metrics`.
- Grafana dashboards track service latency, error rate, recognition confidence distribution, attendance volume, queue lag, and training job duration.
- Centralized logs can use Loki or ELK.

## Service Discovery

Kubernetes service DNS is the default discovery layer:

- `auth-service.default.svc.cluster.local`
- `student-service.default.svc.cluster.local`
- `attendance-service.default.svc.cluster.local`
- `face-recognition-service.default.svc.cluster.local`

For local development, Docker Compose service names provide discovery.

## Migration Plan

### Phase 1: Modularize the Monolith

- Move current Express features into domain-style modules.
- Keep one deployment.
- Introduce correlation IDs, structured logs, health endpoints, and environment validation.

### Phase 2: Extract Identity and Student Registry

- Create Auth Service from current auth routes/controllers/models.
- Create Student Service from the current `Student` model and related routes.
- Gateway routes `/api/auth/*` and `/api/students/*` to new services.

### Phase 3: Extract Attendance

- Move `markAttendanceForLabel` and attendance query/export behavior into Attendance Service.
- Replace direct notification/work-session side effects with events.
- Add unique index for duplicate prevention.

### Phase 4: Extract Face Services

- Face Capture owns dataset capture.
- Face Training owns embeddings and model artifacts.
- Face Recognition owns scan/compare APIs.
- Attendance consumes `face.recognized` events or calls recognition through REST for low-latency scans.

### Phase 5: Extract System Events and Timeline

- Move `system_event_monitor.py` into System Event Monitoring Service.
- Build Activity Timeline Service as an event-fed read model.

### Phase 6: Add Reporting, Analytics, Audit, Notification

- Move report generation out of Attendance Service.
- Build Audit Service as append-only consumer.
- Build Analytics Service from event streams.
- Notification Service consumes domain events and sends email/SMS/push.

### Phase 7: Kubernetes Production Hardening

- Add resource requests/limits.
- Add HPA rules.
- Add network policies.
- Add secret management.
- Add backup/restore jobs.
- Add blue-green or canary deployment strategy.

