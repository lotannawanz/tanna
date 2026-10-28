# Tanna

**Payment clarity for WhatsApp and Instagram commerce in Nigeria.**

## The Problem

Millions of Nigerian vendors sell daily through WhatsApp and Instagram DMs. Their payment workflow is fundamentally broken:

| What Happens Today | The Cost |
|---|---|
| Buyer sends a bank transfer | Vendor has no way to verify instantly |
| Buyer sends a screenshot as "proof" | Screenshots can be faked |
| NIP confirmation is delayed | Vendor refreshes bank app repeatedly |
| Payment disputes happen in DMs | Trust erodes, sales slow down |

**The pain isn't speed. It isn't checkout UX. It's uncertainty.**

> "I've sent it, check again" — every vendor has heard this. Tanna makes this sentence unnecessary.

## What Tanna Does

Tanna gives vendors a **payment link** they can drop into any DM. When a buyer pays through that link:

1. **Payment is verified independently** via Paystack webhooks — no screenshots needed
2. **Both parties are notified instantly** via WhatsApp — no manual checking
3. **An order is created automatically** — no spreadsheets, no lost sales
4. **A confirmation page proves the transaction** — replaces screenshots forever

Tanna is not a marketplace. Not a website builder. Not a wallet.  
**Tanna is a payment verification layer that sits on top of how vendors already sell.**

## Who It's For

High-velocity WhatsApp and Instagram vendors in Nigeria:
- Food vendors processing 20+ orders/day
- Hair and beauty vendors with high-value items
- Clothing vendors managing multiple DM conversations

These vendors don't want to "learn software." They want to know when they've been paid.

## Product Documents

| Document | Description |
|---|---|
| [Product Brief](docs/PRODUCT_BRIEF.md) | Full product manifesto — ICP, thesis, MVP scope, system primitives, and monetization strategy |
| [Engineering Roadmap](docs/ENGINEERING_ROADMAP.md) | Prioritized build order with 11 epics, acceptance criteria, and explicit constraints |
| [System Architecture](docs/ARCHITECTURE.md) | Technical architecture, data flow diagrams, and system design decisions |
| [Operational Runbook](backend/docs/operational-runbook.md) | Backup strategy, disaster recovery, WhatsApp fallback, dispute handling |

## Tech Stack

### Frontend (`/frontend`)
- **Framework**: React + Vite
- **Language**: TypeScript
- **Design**: Mobile-first, "boring-on-purpose" UI optimized for trust over aesthetics

### Backend (`/backend`)
- **Runtime**: Node.js + Fastify
- **Database**: PostgreSQL + Prisma ORM
- **Payments**: Paystack (webhook-verified, idempotent)
- **Notifications**: WhatsApp Business API (template-based, event-driven)
- **Architecture**: Forward-only state machine for payments and orders

## Project Structure

```
Tanna/
├── docs/                          # Product & architecture documentation
│   ├── PRODUCT_BRIEF.md           # Product manifesto
│   ├── ENGINEERING_ROADMAP.md     # Prioritized build epics
│   └── ARCHITECTURE.md            # System architecture
│
├── backend/                       # Node.js/Fastify API
│   ├── src/
│   │   ├── routes/                # API endpoints
│   │   ├── services/              # Business logic (payments, orders, WhatsApp)
│   │   ├── lib/                   # Shared utilities (idempotency, queue, events)
│   │   ├── middleware/            # Auth middleware
│   │   ├── workers/               # Background job handlers
│   │   └── config/                # Environment validation
│   ├── prisma/                    # Database schema & migrations
│   └── docs/                      # Operational runbook
│
├── frontend/                      # React SPA
│   ├── src/
│   │   ├── pages/                 # Vendor dashboard, public product pages, auth
│   │   ├── components/            # Reusable UI components
│   │   ├── context/               # Auth state management
│   │   ├── lib/                   # API client
│   │   └── types/                 # TypeScript definitions
│   └── public/                    # Static assets
```

## Key Design Decisions

1. **Webhook is the source of truth** — Redirect success is not confirmation. Only Paystack webhooks mutate order state.
2. **Idempotency everywhere** — Duplicate webhooks are safely ignored. Payment state can only move forward.
3. **Product snapshots at order time** — Price changes after purchase never retroactively affect existing orders.
4. **No buyer accounts** — Buyers pay and go. Zero friction.
5. **WhatsApp is a trust surface** — Template-only messages. No chatbots, no marketing, no upsells.

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Paystack account (test keys)

### Setup

```bash
# Clone
git clone https://github.com/lotannawanz/tanna.git
cd tanna

# Backend
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Current Status

**MVP in development** — Core payment flow (product page → Paystack checkout → webhook verification → order creation → WhatsApp notification) is functional end-to-end.

## License

Proprietary. All rights reserved.
