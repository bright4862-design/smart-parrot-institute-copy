FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_BASE44_APP_ID=69c16c52c86d161e74940243
ARG VITE_BASE44_SERVER_URL=https://base44.app
ARG VITE_BASE44_APP_BASE_URL=https://base44.app
ARG VITE_BASE44_FUNCTIONS_VERSION=preview

# Vite embeds these public Base44 routing values into the browser bundle.
# Authentication and service-role tokens must never be added here.
ENV VITE_BASE44_APP_ID=${VITE_BASE44_APP_ID}
ENV VITE_BASE44_SERVER_URL=${VITE_BASE44_SERVER_URL}
ENV VITE_BASE44_APP_BASE_URL=${VITE_BASE44_APP_BASE_URL}
ENV VITE_BASE44_FUNCTIONS_VERSION=${VITE_BASE44_FUNCTIONS_VERSION}

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
