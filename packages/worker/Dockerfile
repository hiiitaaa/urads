FROM node:20-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/worker/ packages/worker/

WORKDIR /app/packages/worker

EXPOSE 8787

CMD ["/app/node_modules/.bin/wrangler", "dev", "--local", "--persist-to", ".wrangler/state", "--ip", "0.0.0.0"]
