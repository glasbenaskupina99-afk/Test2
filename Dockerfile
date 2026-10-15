FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY run.py .
ENV HANZI_DATA_DIR=/data
VOLUME /data
EXPOSE 8443
CMD ["python", "run.py"]
