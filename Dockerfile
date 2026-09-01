# The API and the built front end in one image, because the API is what serves
# the front end: /n/42 has to arrive with its own <head> already written and
# this process is the only one holding the entry. Splitting them is the one
# thing this image must not do.
FROM python:3.11-slim

WORKDIR /app

COPY Namba-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY Namba-backend/ ./
COPY Namba-frontend/dist/ ./dist/

# The database, the uploads and secret.key all sit beside DB_PATH, so one
# volume holds everything that has to outlive the image. secret.key especially:
# it salts the hashes in events, and a new one every deploy silently stops
# matching the blocks it wrote.
ENV NAMBA_DIST=/app/dist \
    NAMBA_DB=/data/namba.db \
    NAMBA_UPLOADS=/data/uploads
VOLUME /data

EXPOSE 8001

# --workers 1 is a requirement, not a default: the rate limiter lives in process
# memory, so a second worker is a second allowance for the same IP.
# --forwarded-allow-ips=* is safe only because 8001 is never published -- the
# port exists on the compose network alone, so nothing that could forge
# X-Forwarded-For can reach it. Publishing this port undoes that.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", \
     "--workers", "1", "--proxy-headers", "--forwarded-allow-ips=*"]
