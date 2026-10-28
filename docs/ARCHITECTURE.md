# Tanna — System Architecture

## Overview

Tanna is a monorepo containing a React frontend and a Node.js/Fastify backend. The system is designed around a single principle: **payment state must be indisputable**.

Every architectural decision flows from this. Webhooks are the source of truth. State transitions are forward-only. Notifications are event-driven.

---

## System Architecture

```mermaid
graph TB
    subgraph "Buyer Flow"
        A[Buyer receives link in DM] --> B[Public Product Page]
        B --> C[Enters phone + details]
        C --> D[Paystack Checkout]
        D --> E[Payment Success Page]
    end

    subgraph "Payment Verification"
        D --> F[Paystack processes payment]
        F --> G[Paystack sends webhook]
        G --> H[Webhook Handler]
        H --> I{Idempotency Check}
        I -->|New event| J[Store raw webhook]
        I -->|Duplicate| K[Safely ignore]
        J --> L[Verify payment with Paystack API]
        L --> M[Update payment state machine]
    end

    subgraph "Order Processing"
        M --> N[Create/confirm order]
        N --> O[Event emitter fires]
        O --> P[Job Queue]
    end

    subgraph "Notifications"
        P --> Q[WhatsApp Worker]
        Q --> R[Buyer confirmation message]
        Q --> S[Vendor new order message]
    end

    subgraph "Vendor Dashboard"
        T[Vendor logs in] --> U[Orders list]
        U --> V[Order detail view]
        V --> W[Fulfillment actions]
    end
```

---

## Data Flow: Payment Lifecycle

```mermaid
stateDiagram-v2
    [*] --> CREATED: Order initialized
    CREATED --> AWAITING_PAYMENT: Checkout initiated
    AWAITING_PAYMENT --> CONFIRMED: Webhook verified
    AWAITING_PAYMENT --> CANCELLED: Payment failed/expired
    CONFIRMED --> FULFILLED: Vendor marks complete
    CONFIRMED --> REFUNDED: Refund processed

    note right of CONFIRMED
        Only Paystack webhooks can
        trigger this transition.
        Redirect success is NOT
        confirmation.
    end note
```

---

## Payment State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Payment record created
    PENDING --> SUCCESS: Webhook confirms charge
    PENDING --> FAILED: Webhook reports failure
    
    note right of SUCCESS
        Terminal state.
        Forward-only transitions.
        Cannot revert to PENDING.
    end note
    
    note right of FAILED
        Terminal state.
        Duplicate webhooks for
        completed payments are
        safely ignored.
    end note
```

---

## Core Components

### Backend (`/backend/src`)

| Component | Purpose |
|---|---|
| `routes/webhooks.ts` | Receives Paystack webhooks, validates signature, triggers processing |
| `routes/public.routes.ts` | Public product pages and checkout initiation (no auth required) |
| `routes/orders.ts` | Vendor order management (authenticated) |
| `routes/products.ts` | Product CRUD for vendors |
| `routes/auth.ts` | Vendor registration and login |
| `services/payment.service.ts` | Payment state machine and verification logic |
| `services/order.service.ts` | Order creation with product snapshots |
| `services/whatsapp.service.ts` | WhatsApp Business API integration |
| `services/notification.handler.ts` | Event-driven notification dispatch |
| `lib/idempotency.ts` | Webhook deduplication and forward-only state enforcement |
| `lib/queue.ts` | Postgres-backed durable job queue |
| `lib/events.ts` | Internal event emitter for decoupled processing |
| `worker.ts` | Background job processor (WhatsApp delivery, webhook processing) |

### Frontend (`/frontend/src`)

| Component | Purpose |
|---|---|
| `pages/public/PublicProductPage.tsx` | Buyer-facing product page (mobile-optimized) |
| `pages/PaymentVerify.tsx` | Post-payment confirmation screen |
| `pages/vendor/VendorDashboard.tsx` | Order overview for vendors |
| `pages/vendor/ProductListPage.tsx` | Product management |
| `pages/auth/LoginPage.tsx` | Vendor authentication |
| `components/public/BuyerInfoForm.tsx` | Checkout form (name, phone, quantity) |
| `context/AuthContext.tsx` | JWT-based auth state management |

---

## Database Schema

```mermaid
erDiagram
    VENDOR ||--o{ STORE : owns
    STORE ||--o{ PRODUCT : contains
    PRODUCT ||--o{ ORDER_ITEM : "snapshot in"
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER ||--|| PAYMENT : "paid by"
    ORDER }o--|| STORE : "placed at"
    WEBHOOK_EVENT ||--o| PAYMENT : triggers
    ORDER ||--o{ MESSAGE_LOG : "notifies via"

    VENDOR {
        string id PK
        string email
        string password_hash
        string business_name
        string phone
    }

    STORE {
        string id PK
        string slug UK
        string name
        string status
    }

    PRODUCT {
        string id PK
        string slug
        string name
        int price_in_kobo
        string description
        string status
    }

    ORDER {
        string id PK
        string status
        int total_amount
        string buyer_name
        string buyer_phone
    }

    PAYMENT {
        string id PK
        string paystack_reference UK
        string status
        int amount
        datetime processed_at
    }

    WEBHOOK_EVENT {
        string id PK
        string event_id UK
        json raw_payload
        boolean processed
    }
```

---

## Key Architectural Decisions

### 1. Webhook-First Payment Verification
**Decision**: Only Paystack webhooks mutate payment/order state. Client-side redirect success is ignored.  
**Rationale**: Redirect-based confirmation is unreliable (browser closes, network drops). Webhooks are server-to-server and retried by Paystack.

### 2. Postgres-Backed Job Queue
**Decision**: Use PostgreSQL for job queuing instead of Redis/RabbitMQ.  
**Rationale**: One fewer infrastructure dependency. Transactional consistency with order data. Sufficient throughput for MVP scale.

### 3. Product Snapshots in Orders
**Decision**: Order items store a snapshot of the product at purchase time, not a foreign key reference.  
**Rationale**: Vendors change prices. A buyer who paid ₦5,000 should see ₦5,000 on their receipt, even if the vendor later changes the price to ₦7,000.

### 4. Forward-Only State Machines
**Decision**: Payment state (PENDING → SUCCESS/FAILED) and order state (CREATED → AWAITING_PAYMENT → CONFIRMED) can only move forward.  
**Rationale**: Prevents accidental state regression. Makes idempotency trivial — if state has already advanced, skip the event.

### 5. WhatsApp Template-Only Messages
**Decision**: All WhatsApp messages use pre-approved Meta templates. No free-text messaging.  
**Rationale**: Meta requires template approval for business-initiated messages. Templates also enforce message discipline — no marketing spam, just transaction facts.

---

## Infrastructure (Staging)

- **Compute**: AWS EC2 (t3.micro) with PM2 process manager
- **Database**: PostgreSQL 15 on the same instance
- **Deployment**: Script-based (`deploy-ec2.ps1`) with server setup automation (`server-setup.sh`)
- **Process Management**: PM2 ecosystem config for app + worker processes
