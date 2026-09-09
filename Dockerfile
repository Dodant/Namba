# The API and the built front end in one image, because the API is what serves
# the front end: /n/42 has to arrive with its own <head> already written and
# this process is the only one holding the entry. Splitting them is the one
# thing this image must not do. .dockerignore says what stays out: the
# developer's database, uploads and secret.key above all.
FROM python:3.11-slim

WORKDIR /app

COPY Namba-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY Namba-backend/ ./
COPY Namba-frontend/dist/ ./dist/

# The database, the uploads and secret.key all sit beside DB_PATH, so one
# volume holds everything that has to outlive the image. secret.key especially:
# it salts the hashes in events and, unless NAMBA_TOTP_SECRET is set, roots the
# operator TOTP keys. A new one silently stops matching blocks and authenticators.
ENV NAMBA_DIST=/app/dist \
    NAMBA_DB=/data/namba.db \
    NAMBA_UPLOADS=/data/uploads
VOLUME /data

# The process runs as this user, not root. It is dropped to at start rather
# than with USER, because /data may already exist owned by root from an earlier
# image: CMD fixes the volume's owner once, then drops privileges for good.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin namba \
    && mkdir -p /data && chown namba:namba /data

EXPOSE 8001

# Two URLs, because they fail differently: / needs dist/ and proves the front
# end shipped, /api/tags reads the database and proves it opens. No curl in
# slim, so the stdlib asks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8001/', timeout=4); u.urlopen('http://127.0.0.1:8001/api/tags', timeout=4)"]

# --workers 1 is a requirement, not a default: the rate limiter lives in process
# memory, so a second worker is a second allowance for the same IP.
# --forwarded-allow-ips=* is safe only because 8001 is never published -- the
# port exists on the compose network alone, so nothing that could forge
# X-Forwarded-For can reach it. Publishing this port undoes that.
CMD ["sh", "-c", "[ \"$(stat -c %u /data)\" = 10001 ] || chown -R namba:namba /data; exec runuser -u namba -- uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1 --proxy-headers --forwarded-allow-ips=*"]
