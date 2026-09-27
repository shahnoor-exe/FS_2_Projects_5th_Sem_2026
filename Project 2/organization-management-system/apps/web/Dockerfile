FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/web/package*.json ./apps/web/
RUN npm install
COPY apps/web/ ./apps/web/
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 3000;
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
CMD ["nginx", "-g", "daemon off;"]
