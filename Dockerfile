# ============================================================
# Stage 1: Base image với Node.js + LibreOffice
# ============================================================
FROM node:24-slim

# Cài LibreOffice (cần thiết cho libreoffice-convert)
RUN apt-get update && apt-get install -y \
    libreoffice \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# Tạo thư mục làm việc
# ============================================================
WORKDIR /app

# Copy package files trước (tận dụng Docker layer cache)
COPY package*.json ./

# Cài dependencies
RUN npm install --omit=dev

# Copy toàn bộ source code
COPY . .

# Tạo sẵn các thư mục cần thiết
RUN mkdir -p uploads output

# Expose port API
EXPOSE 3000