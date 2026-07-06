# Build stage: install dependencies and build the React app
FROM node:20-alpine AS builder

WORKDIR /app

# Cache npm install by copying only manifest files first
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage: lightweight static server
FROM nginx:alpine

# Copy build output into the app's base path
COPY --from=builder /app/dist /usr/share/nginx/html/warframe-todo-tracker

# Nginx config: serve from subdirectory, redirect root to app
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location = / {\n\
        return 301 /warframe-todo-tracker/;\n\
    }\n\
    location /warframe-todo-tracker {\n\
        try_files $uri $uri/ /warframe-todo-tracker/index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
