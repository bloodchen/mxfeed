#!/bin/bash
docker stop redis
docker rm redis
# Start Redis container with mxnet network and always restart policy
docker network create mxnet 2>/dev/null || true
docker run -d \
  --name redis \
  --network mxnet \
  --restart always \
  -p 6379:6379 \
  redis:latest

echo "Redis container started with mxnet network and always restart policy"