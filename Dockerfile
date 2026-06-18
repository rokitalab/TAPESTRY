# Stage 1: build
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies first for better Docker layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy only files required to build the Vite frontend.
COPY index.html ./
COPY public ./public
COPY src ./src
COPY vite.config.js ./
COPY eslint.config.js ./

RUN npm run build

# Stage 2: serve static build via nginx
FROM nginx:1.29-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
