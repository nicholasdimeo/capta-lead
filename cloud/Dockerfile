# Capta Cloud in un contenitore (Railway, Fly.io, un server qualsiasi con Docker).
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY capta_cloud ./capta_cloud
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH" CAPTA_AMBIENTE=produzione PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn capta_cloud.principale:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
