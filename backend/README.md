# Tanna Backend

Production-grade backend for Tanna - payment confirmation infrastructure for social commerce.

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL 15 + Prisma ORM
- **Logging**: Pino

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   # Copy example to local
   cp .env.example .env.local
   
   # Edit with your database credentials
   notepad .env.local
   ```

3. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

4. Run database migrations:
   ```bash
   npm run db:migrate
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes (dev only) |
| `npm run db:studio` | Open Prisma Studio |

## API Endpoints

### Health Check
```
GET /health
```
Returns system status for load balancers and monitoring.

## Architecture

```
src/
├── config/         # Environment & configuration
│   └── env.ts      # Zod-validated environment variables
├── lib/            # Shared utilities
│   ├── database.ts # Prisma client singleton
│   ├── idempotency.ts # Webhook deduplication & payment state machine
│   └── logger.ts   # Pino structured logging
├── routes/         # API routes
│   └── health.ts   # Health check endpoint
└── index.ts        # Server entry point
```

## Database Schema

- `vendors` - Authenticated users who sell
- `stores` - Public-facing storefronts
- `products` - Items for sale
- `orders` - Immutable purchase records (with product snapshots)
- `payments` - Payment records (forward-only state machine)
- `webhook_events` - Raw webhook storage for idempotency

## Idempotency

All webhook handling is idempotent:
- Events are stored before processing
- Duplicate events are safely ignored
- Payment state can only move forward (PENDING → SUCCESS/FAILED)
