import os

from fastapi import FastAPI


service_name = os.getenv("SERVICE_NAME", "python-service")
app = FastAPI(title=service_name)


@app.get("/health/live")
def live():
    return {"status": "live", "service": service_name}


@app.get("/health/ready")
def ready():
    return {"status": "ready", "service": service_name}


@app.get("/")
def root():
    return {
        "service": service_name,
        "message": "Replace this template with a Clean Architecture service implementation.",
    }

