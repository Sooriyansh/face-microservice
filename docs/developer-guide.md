# Developer Guide

## Current Migration Strategy

The microservices are extracted as independent entrypoints under `services/*`. They reuse existing working route handlers, models, Python scripts, and helper modules through repo-relative imports. This preserves behavior while allowing each domain to run separately.

## Run One Service Locally

```bash
npm --prefix services/attendance-service start
```

Make sure the service has the required environment variables from its `.env.example`.

## Add New Logic

- Put cross-service utilities in `services/shared`.
- Keep HTTP entrypoints in `services/<name>/src/server.js`.
- Keep existing business behavior unchanged unless a focused refactor is required.
- Prefer repository/service boundaries when extracting code from root modules into service-local folders.

## Next Extraction Steps

1. Move route files from `routes/api` into matching `services/*/src/routes`.
2. Move models into service-owned model folders while preserving collection names.
3. Replace direct helper imports with shared package imports.
4. Replace synchronous cross-domain side effects with events.
5. Add automated tests per service.

