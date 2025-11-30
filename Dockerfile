# Base image with Node.js
FROM node:20-bullseye-slim

# Install system dependencies for yt-dlp and ffmpeg
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip (to get the latest version easily)
RUN python3 -m pip install -U yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (default for Fastify)
EXPOSE 3000

# The CMD is overridden by docker-compose or Render start command
CMD ["npm", "run", "start"]