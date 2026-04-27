# ============================================================================
# Stage 1: Builder
# ============================================================================

FROM node:20-alpine AS builder

WORKDIR /build

# Habilitar corepack para usar pnpm
RUN corepack enable

# Copiar workspace root files para instalar dependências
COPY pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY package.json ./

# Copiar packages do workspace
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server

# Instalar dependências
RUN pnpm install --prod=false

# Build da aplicação
WORKDIR /build/artifacts/api-server
RUN pnpm run build

# ============================================================================
# Stage 2: Runtime
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# Habilitar corepack
RUN corepack enable

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copiar workspace root files
COPY --chown=nodejs:nodejs pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY --chown=nodejs:nodejs package.json ./

# Copiar apenas o que é necessário do workspace (dependências runtime)
COPY --chown=nodejs:nodejs lib ./lib

# Cwd para api-server
WORKDIR /app/artifacts/api-server

# Copiar package.json e source
COPY --chown=nodejs:nodejs artifacts/api-server/package.json ./
COPY --chown=nodejs:nodejs artifacts/api-server/src ./src
COPY --chown=nodejs:nodejs artifacts/api-server/build.mjs ./

# Instalar apenas dependências de produção
RUN pnpm install --prod=true

# Copiar build do stage anterior
COPY --from=builder --chown=nodejs:nodejs /build/artifacts/api-server/dist ./dist

# Usar usuário não-root
USER nodejs

# Expor portas
EXPOSE 8080 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Variáveis de ambiente defaults
ENV NODE_ENV=production \
    PORT=8080 \
    TCP_PORT=5000

# Start
CMD ["node", "--enable-source-maps", "--env-file-if-exists=.env", "./dist/index.mjs"]
