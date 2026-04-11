# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (shared lib), Supabase (GPS tracker)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## GPS Tracker (TK303G) — Microserviço TCP

O `api-server` inclui um servidor TCP para receber dados de rastreadores GPS TK303G.

### Arquitetura

- `src/tcp/server.ts` — Servidor TCP (Node.js `net`), porta configurável via `TCP_PORT`
- `src/tcp/parser.ts` — Parser dos pacotes GPS do TK303G
- `src/tcp/supabase.ts` — Persistência no Supabase (tabela `caminhao_localizacao_atual`)

### Variáveis de ambiente necessárias

- `TCP_PORT` — porta do servidor TCP (padrão: 5000)
- `SUPABASE_URL` — URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — service role key do Supabase (secret)

### Formato do pacote TK303G

```
imei:123456789012345,tracker,210101123000,,A,-19.12345,-44.12345,60.5,...
```

### Migração do banco

Execute o SQL em `artifacts/api-server/sql/migration_caminhao_localizacao.sql`
no SQL Editor do Supabase para adicionar as colunas necessárias.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
