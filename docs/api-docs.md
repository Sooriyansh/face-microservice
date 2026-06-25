# API Docs

All external API traffic should enter through API Gateway on port `8080`.

## Gateway Routes

| Route | Service |
| --- | --- |
| `/api/auth/*` | auth-service |
| `/api/students/*` | student-service |
| `/api/attendance/*` | attendance-service |
| `/api/work-sessions/*` | attendance-service |
| `/api/hrms/*` | attendance-service |
| `/api/notifications/*` | notification-service |
| `/api/system-events/*` | system-events-service |
| `/api/recognition/*` | face-recognition-service |
| `/api/training/*` | training-service |
| `/api/analytics/*` | analytics-service |
| `/api/audit/*` | audit-service |

## Health

Every service exposes:

- `GET /health/live`
- `GET /health/ready`

## Important Endpoints

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/employee-face-login`
- `GET /api/students`
- `POST /api/students`
- `PUT /api/students/:studentId/enrollment`
- `GET /api/attendance`
- `POST /api/attendance/mark`
- `POST /api/attendance/scan`
- `POST /api/recognition/scan`
- `POST /api/training/jobs`
- `GET /api/system-events`
- `POST /api/system-events/ingest`
- `GET /api/notifications`
- `GET /api/analytics/summary`
- `POST /api/audit/logs`

