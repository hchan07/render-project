# Step 1: Build Stage
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# This tells pnpm it's in a non-interactive environment
ENV CI=true 
RUN corepack enable

FROM base AS build
WORKDIR /usr/src/app

# Copy only files needed for install first (better caching)
COPY pnpm-lock.yaml package.json ./

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Now copy the rest of your source code
COPY . .

# Step 2: Runtime Stage
FROM base AS runtime
WORKDIR /usr/src/app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package.json ./package.json
COPY . .

EXPOSE 3000
CMD [ "pnpm", "start" ]