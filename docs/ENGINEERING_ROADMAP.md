Below is a clean translation of the Tanna manifesto into engineering epics, written the way a senior FAANG PM would hand to an agentic IDE or a high-performance team.

This is not a task list.
This is a build order with intent.

You do not reorder these unless reality punches you in the face.

Tanna Engineering Epics (v1)
EPIC 0: System Foundations (Non-Negotiable)

Goal: Make the system trustworthy before it is pretty.

Outcomes

Every payment can be verified

Every order has a single source of truth

Failures are observable and recoverable

Scope

Core backend service

Database schema (vendors, stores, products, orders, payments)

Environment configuration

Secrets management

Logging and error tracking

Idempotency framework

Acceptance Criteria

Duplicate webhooks do not create duplicate orders

Payment state can never be “unknown”

Every order has a permanent ID

Raw Paystack payloads are stored

If this epic is weak, nothing else matters.

EPIC 1: Vendor Identity & Store Creation

Goal: Let a vendor exist in the system with minimal ceremony.

Scope

Vendor authentication (email + password or magic link)

Store creation

Store metadata (name, public slug, vendor association)

Public store URL

Explicit Constraints

No business address

No KYC

No category selection

No onboarding wizard

Acceptance Criteria

A vendor can create a store in under 5 minutes

A store link is shareable immediately

No empty dashboard paralysis

If this feels slow, you failed.

EPIC 2: Product Management

Goal: Allow vendors to represent what they already sell.

Scope

Product CRUD

Product price

Product description

Optional quantity

Product snapshotting at time of order

Explicit Constraints

No variants in v1

No images required

No SEO nonsense

Acceptance Criteria

Product links are instantly usable

Product data at purchase time is immutable

Vendors never edit past orders by mistake

This epic exists to support payments, not merchandising.

EPIC 3: Public Product Pages

Goal: Convert buyers without explanation.

Scope

Mobile-optimized product page

Vendor name display

Clear price

Single “Pay” CTA

Paystack checkout initiation

Explicit Constraints

No buyer accounts

No reviews

No upsells

No distractions

Acceptance Criteria

Page loads fast on poor networks

Buyer understands what they are paying for instantly

CTA is unambiguous

If a buyer hesitates, the page is wrong.

EPIC 4: Payments & Webhook Verification

Goal: Make payment state indisputable.

Scope

Paystack checkout integration

Webhook listener

Payment verification logic

Payment state machine

Retry and failure handling

Explicit Constraints

Redirect success is not confirmation

Webhook is the source of truth

Idempotency required everywhere

Acceptance Criteria

Payment success is only marked after verification

Failed or abandoned payments do not create orders

Duplicate events are safely ignored

This epic is where startups usually die quietly.

EPIC 5: Order Creation & Management

Goal: Turn payments into actionable orders.

Scope

Order generation after verified payment

Order detail page

Order list for vendors

Order status (paid only in v1)

Explicit Constraints

No fulfillment statuses yet

No delivery tracking

No refunds in v1

Acceptance Criteria

Every verified payment produces exactly one order

Orders are easily searchable

Order data is readable without explanation

Orders are the heart of Tanna.

EPIC 6: Confirmation Experience (Web)

Goal: Kill buyer anxiety instantly.

Scope

Payment success page

Order summary display

Vendor name

Order ID

WhatsApp confirmation indicator

Explicit Constraints

No animations

No celebration language

No marketing copy

Acceptance Criteria

Buyer trusts the transaction is complete

Buyer knows what happens next

Page is shareable if needed

This page replaces screenshots.

EPIC 7: WhatsApp Notifications (Core Differentiator)

Goal: Eliminate reconciliation entirely.

Scope

WhatsApp Business API integration

Message templates for buyers

Message templates for vendors

Delivery status tracking

Fallback to email

Explicit Constraints

Messages must be short and factual

Order ID included everywhere

Vendor message must be actionable

Acceptance Criteria

Buyer receives confirmation within seconds

Vendor receives order instantly

Vendors stop manually checking bank apps

If WhatsApp is flaky, you fix WhatsApp. You do not ignore it.

EPIC 8: Vendor Dashboard (Operational Clarity)

Goal: Let vendors see what matters, nothing else.

Scope

Orders table

Payment status

Order detail view

Basic filtering

Explicit Constraints

No charts

No analytics

No AI insights

Acceptance Criteria

Vendor can answer “what did I sell today?” instantly

No confusion about payment state

Dashboard works on mobile

This is a control panel, not a cockpit.

EPIC 9: “See Example” Experience

Goal: Explain Tanna without words.

Scope

Example store

Example product

Example checkout

Example confirmation page (clearly marked)

Explicit Constraints

No signup required

No fake testimonials

No marketing copy

Acceptance Criteria

User understands Tanna in under 30 seconds

User can imagine sharing the link immediately

No explanation needed from you

This epic drives adoption quietly.

EPIC 10: Reliability, Edge Cases & Polish

Goal: Make Tanna boring in production.

Scope

Network failure handling

Payment delays

Partial failures

Graceful error messages

Copy review

Acceptance Criteria

System degrades gracefully

Errors explain what happened and what to do

No silent failures

Boring systems scale. Flashy ones break.

Build Order (Do Not Debate)

Epic 0

Epic 4

Epic 5

Epic 6

Epic 7

Epic 1

Epic 2

Epic 3

Epic 8

Epic 9

Epic 10

If you build dashboards before payments, you are playing startup theater.