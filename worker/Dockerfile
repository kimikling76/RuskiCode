FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium poppler-utils fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY worker ./worker
COPY skills ./skills
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV BOOK_FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "worker/index.ts"]
