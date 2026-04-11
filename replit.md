# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### FB Agency Dashboard (`artifacts/fb-agency`)
- **Type**: react-vite, preview at `/`
- **Purpose**: Facebook Page Automation Agency Dashboard ("PageFlow")
- **Features**:
  - Overview dashboard with stats cards (active pages, automation health, account health, token balance)
  - FB Accounts management — connect/disconnect Facebook accounts
  - Pages management — add/remove pages, toggle automation, set posting frequency
  - Agency Settings with 3-step BYOC wizard (Bring Your Own Credentials) for Facebook Developer App setup
  - Token system with packages and transaction history

### API Server (`artifacts/api-server`)
- Express 5 backend, serves all routes under `/api`
- Routes: `/api/agency/settings`, `/api/accounts`, `/api/pages`, `/api/overview/stats`, `/api/tokens`

## Database Schema

- `agency_settings` — single-row agency config (BYOC app credentials, setup progress)
- `facebook_accounts` — connected Facebook user accounts
- `facebook_pages` — managed Facebook pages (with automation settings)
- `token_balance` — single-row token balance
- `token_transactions` — token purchase/usage history
