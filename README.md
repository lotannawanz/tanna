# Tanna

**Payment clarity and order confirmation for WhatsApp and Instagram vendors.**

Tanna is a system designed to insert structure into informal commerce without turning it into formal e-commerce. It solves the specific problem of payment reconciliation and order confirmation for vendors who operate primarily in DMs.

> **Note:** This project is currently **Private** and intended for commercial launch.

##  The Problem

Millions of vendors sell via WhatsApp/Instagram. Their workflow is broken:
- Payments arrive with no context.
- Vendors waste time manually reconciling bank transfers with screenshots.
- Buyers feel anxious after paying.
- Orders get lost or disputed.

**Tanna is not a marketplace. It is not a website builder. It is a payment-confirmed product page and notification system.**

##  Core Principles

1.  **Informal by Nature, Structured by Design**: Respects how vendors sell in DMs.
2.  **Boring Is Trustworthy**: No hype, no complex animations. Clear text beats clever design.
3.  **One Job, Done Well**: Every feature must improve payment clarity and trust.

##  Tech Stack

This project is a monorepo containing both the frontend and backend.

### Frontend (`/frontend`)
- **Framework**: [React](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: Vanilla CSS (Tailored design system, no frameworks)
- **Key Features**:
    - Product pages optimized for trust and speed.
    - Payment verification screens.
    - clean, "boring" UI that feels authoritative.

### Backend (`/backend`)
- **Runtime**: Node.js
- **Server**: [Fastify](https://fastify.dev/)
- **Database ORM**: [Prisma](https://www.prisma.io/)
- **Language**: TypeScript
- **Key Features**:
    - Secure payment processing via Paystack.
    - Webhook handling for indisputable payment truth.
    - Idempotency enforcement.

##  Project Structure

```
Tanna/
├── backend/          # Node.js/Fastify Backend
│   ├── src/
│   │   ├── services/ # Business logic (Paystack, etc.)
│   │   ├── routes/   # API endpoints
│   │   └── lib/      # Shared utilities
│   └── prisma/       # Database schema
│
├── frontend/         # React Frontend
│   ├── src/
│   │   ├── components/
│   │   └── pages/
│   └── public/
│
└── product_manifest.md # The Single Source of Truth for the project
```

##  Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (Local or hosted)
- Paystack Account (Test keys)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/lotannawanz/tanna.git
    cd tanna
    ```

2.  **Setup Backend**
    ```bash
    cd backend
    npm install
    # Copy .env.example to .env and fill in your details
    cp .env.example .env
    # Run migrations
    npx prisma migrate dev
    # Start server
    npm run dev
    ```

3.  **Setup Frontend**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

##  License

Proprietary. All rights reserved.
