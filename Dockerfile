# The UI is TypeScript: compile it first, then run the Python server.
FROM node:22-slim AS ui
WORKDIR /src
COPY mobile/package.json mobile/package-lock.json mobile/
RUN cd mobile && npm ci --no-audit --no-fund
COPY app ./app
COPY mobile ./mobile
RUN cd mobile && npm run build:server

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY --from=ui /src/app/static/dist ./app/static/dist
COPY run.py .
ENV HANZI_DATA_DIR=/data
VOLUME /data
EXPOSE 8443
CMD ["python", "run.py"]
