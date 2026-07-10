FROM node:22-alpine AS builder
WORKDIR /app
ENV YARN_NODE_LINKER=node-modules
RUN apk add --no-cache python3 build-base
COPY .yarnrc.yml ./
COPY .yarn/releases/ .yarn/releases/
COPY package.json yarn.lock ./
RUN node .yarn/releases/yarn-4.17.1.cjs install
COPY . .
ENV NODE_ENV=production
RUN node .yarn/releases/yarn-4.17.1.cjs run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
