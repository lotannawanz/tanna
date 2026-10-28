# Tanna — Product Manifest

## Product Name
Tanna

## Product Type
B2B SaaS payment confirmation and order verification system for WhatsApp/Instagram commerce.

Tanna is NOT:
- A marketplace
- A wallet
- A bank
- A tax platform
- A consumer app

Tanna IS:
- A payment state authority
- An order confirmation engine
- A trust layer between buyer and seller

---

## Core Problem (Single Sentence)

Online sellers in Nigeria lose time, money, and peace of mind because bank transfers cannot be instantly trusted or reconciled during WhatsApp/Instagram sales.

---

## Primary User (ICP)

### Who
High-velocity WhatsApp and Instagram vendors in Nigeria who sell physical goods.

Examples:
- Food vendors
- Hair vendors
- Clothing vendors

### Characteristics
- Sell daily or multiple times per week
- Accept payments primarily via bank transfer
- Operate entirely through DMs and chats
- Do not want complexity
- Do not want marketplaces
- Do not want to “learn software”

---

## User Pain (In Their Words)

- “I’ve sent it, check again”
- “The alert hasn’t dropped yet”
- Fake transfer screenshots
- Delayed NIP confirmations
- Manual bank app refreshing
- Arguing with buyers in WhatsApp

The pain is NOT speed.
The pain is NOT checkout UX.
The pain is **uncertainty**.

---

## Product Thesis

If a vendor can send a buyer a link that:
- Accepts payment
- Verifies payment independently
- Confirms payment clearly
- Notifies both parties automatically

Then:
- Trust increases
- Fraud decreases
- Conflict disappears
- Sales flow becomes calmer and repeatable

---

## Core Value Proposition

“Know when you’ve actually been paid.”

Tanna replaces:
- Guessing
- Screenshots
- Arguments

With:
- Verified confirmation
- Clear order states
- Automatic notifications

---

## MVP Scope (Strict)

### Included
- Web-first product (mobile-optimized)
- Vendor creates a simple store
- Vendor creates products
- Buyer accesses product or checkout link
- Payment handled via Paystack
- Order created before payment
- Paystack webhook is the single source of truth
- Order state machine drives everything
- WhatsApp notifications sent on key state changes

### Explicitly Excluded
- Wallets
- Holding funds
- Marketplaces
- Buyer accounts
- Subscriptions (for now)
- Inventory analytics
- AI insights
- Tax filing
- Government integrations

---

## System Primitives (Non-Negotiable)

### Order
The Order is the **state authority**.

Order states:
- CREATED
- AWAITING_PAYMENT
- CONFIRMED
- FULFILLED
- CANCELLED
- REFUNDED

No payment = no confirmation.
No webhook = no state change.

---

### Payment
- Managed via Paystack
- Tanna never assumes payment success
- Only webhooks mutate order state
- Idempotency enforced

---

### Notifications
- Event-driven
- WhatsApp only (for v1)
- Templates only
- No free-text messages

WhatsApp is a **trust surface**, not a chat interface.

---

## WhatsApp Notification Policy

### Events that trigger messages
- Order CONFIRMED
- Order FULFILLED
- Order CANCELLED

### Audiences
- Buyer
- Vendor

No marketing messages.
No upsells.
No conversational flows.

---

## UX Philosophy

- Boring
- Obvious
- Calm
- Predictable

The product should feel like:
- A utility
- A receipt
- A referee

Not:
- A social app
- A fintech experiment
- A startup demo

---

## Monetization (Deferred but Defined)

Initial monetization model:
- Per-transaction verification fee
- Framed as “payment confirmation”

No subscriptions until:
- Vendors rely on Tanna daily
- Confirmation volume is high
- Switching cost exists

---

## Non-Goals (To Prevent Drift)

Tanna will not:
- Educate vendors on business
- Replace WhatsApp
- Compete with banks
- Compete with Shopify
- Build consumer loyalty programs

---

## Long-Term Expansion (Not MVP)

Only considered AFTER product-market pull:
- Advanced inventory management
- Business analytics
- Multi-channel notifications
- Tax-ready exports
- Mobile native apps

---

## Success Definition (v1)

Tanna is successful if:
- Vendors trust confirmation without checking their bank app
- Buyers stop sending proof screenshots
- Orders move cleanly from payment to fulfillment
- WhatsApp becomes calmer, not noisier

---

## Guiding Principle

Tanna does not help you get paid faster.

Tanna helps you know when you are paid.

That certainty is the product.
