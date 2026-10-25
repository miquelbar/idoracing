# syntax=docker/dockerfile:1

# Stage 1: Build modern 2026 React/Vite frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /build
RUN apk add --no-cache ca-certificates
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime with FastAPI + Uvicorn
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8501

WORKDIR /app

# Install system dependencies needed for health checks and runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-privileged user and directories
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app

# Copy application code and built frontend
COPY --chown=appuser:appuser . .
COPY --from=frontend-builder --chown=appuser:appuser /build/dist ./frontend/dist

USER appuser

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8501/api/health || exit 1

ENTRYPOINT ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8501"]
