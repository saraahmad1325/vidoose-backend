# Use Bookworm for Python support
FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Setup Virtual Env
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install yt-dlp & PM2 (Process Manager)
RUN pip3 install -U yt-dlp
RUN npm install -g pm2

WORKDIR /app

# Copy and Install
COPY package*.json ./
RUN npm install

# Build
COPY . .
RUN npm run build

# Copy Cookies manually to dist
COPY src/config/cookies.txt dist/config/cookies.txt

# Expose Port
EXPOSE 3000

# 🔥 USE PM2 TO START SERVER (Instead of npm start)
CMD ["pm2-runtime", "ecosystem.config.js"]