# Tanna Operational Runbook

## 1. PostgreSQL Backup Strategy

### Automated Backups (RDS / Self-Hosted)

**If using AWS RDS:**
- Enable automated snapshots with **7-day retention**
- Enable **Point-in-Time Recovery (PITR)** — keeps continuous backups
- Schedule daily manual snapshot via CloudWatch + Lambda at 02:00 UTC

**If self-hosted on EC2:**
```bash
# Daily pg_dump — run via cron at 02:00 UTC
0 2 * * * pg_dump -Fc --no-owner -U tanna_user tanna_db > /backups/tanna_$(date +\%Y\%m\%d).dump

# Upload to S3 with 30-day lifecycle policy
aws s3 cp /backups/tanna_$(date +\%Y\%m\%d).dump s3://tanna-backups/daily/

# Clean local backups older than 7 days
find /backups -name "tanna_*.dump" -mtime +7 -delete
```

### Retention Policy
| Backup Type | Retention |
|------------|-----------|
| Daily snapshots | 7 days |
| Weekly snapshots | 4 weeks |
| Monthly snapshots | 12 months |

---

## 2. Disaster Recovery Procedure

### Database Restore
```bash
# From pg_dump file:
pg_restore -d tanna_db --clean --no-owner /backups/tanna_YYYYMMDD.dump

# From RDS snapshot:
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier tanna-restored \
  --db-snapshot-identifier tanna-daily-YYYYMMDD
```

### Secret Rotation Procedure
1. **JWT_SECRET:**
   - Generate new secret: `openssl rand -base64 48`
   - Update `.env.production` on the server
   - Restart backend → all existing tokens invalidate, vendors must re-login
   - ⚠️ Schedule during low-traffic window (02:00–04:00 WAT)

2. **PAYSTACK_SECRET_KEY:**
   - Regenerate key in Paystack dashboard
   - Update `.env.production`
   - Restart backend
   - ⚠️ Active checkout sessions will fail — communicate via status page

3. **ADMIN_API_KEY:**
   - Generate new key: `openssl rand -hex 32`
   - Update `.env.production` + share new key with admin operators
   - Restart backend

4. **DATABASE_URL password:**
   - Change password in PostgreSQL: `ALTER USER tanna_user PASSWORD 'new_password';`
   - Update `DATABASE_URL` in `.env.production`
   - Restart backend + worker

### Full Server Recovery
1. Launch new EC2 instance from AMI
2. Restore database from latest backup
3. Deploy latest code via `deploy-ec2.ps1`
4. Verify with health endpoint: `GET /api/health`
5. Verify worker heartbeat in admin dashboard

---

## 3. WhatsApp Outage Fallback

### Detection
- Monitor `SEND_WHATSAPP` job failure rate in admin dashboard
- If >50% of WhatsApp jobs fail within 5 minutes → assume Meta outage

### Fallback Logic
1. WhatsApp jobs that fail 3 times get retried with exponential backoff
2. After max retries (5), job goes to `DEAD` → triggers CRITICAL alert
3. **Manual intervention:** Admin checks Meta status page
4. **Future enhancement:** Add SMS fallback via Termii/Africa's Talking as secondary channel

### Recovery
- When Meta API recovers, requeue dead `SEND_WHATSAPP` jobs via admin dashboard
- Route: `POST /internal/admin/jobs/:id/requeue`

---

## 4. Duplicate Payment Handling

### How Duplicates Can Happen
- Buyer clicks "Pay" multiple times before redirect
- Paystack sends duplicate webhooks (network retry)
- Webhook replayed by admin

### System Safeguards
1. **Webhook idempotency:** Each `WebhookEvent` has a unique `eventId`. Duplicate events are rejected at ingestion (`storeWebhookEvent` returns `false`).
2. **Payment state machine:** `CONFIRMED` is a terminal state — the webhook handler checks `processedAt` before processing. Already-confirmed payments are skipped.
3. **Order state machine:** `AWAITING_PAYMENT → CONFIRMED` is a one-way transition. Attempting to confirm an already-confirmed order throws `Invalid order status transition`.

### If a Buyer Is Charged Twice
1. Search for payment by buyer phone in admin: `GET /internal/admin/orders/:id`
2. Verify with Paystack dashboard that two charges exist
3. Refund the duplicate via Paystack dashboard
4. Document in incident log

---

## 5. Support Decision Tree

```
Buyer reports issue
├── "I paid but no confirmation"
│   ├── Check order status in admin dashboard
│   ├── If AWAITING_PAYMENT → check Paystack dashboard for charge
│   │   ├── Charge exists → manually confirm via POST /internal/admin/orders/:id/confirm
│   │   └── No charge → advise buyer to retry
│   └── If CONFIRMED → send them their confirmation page link
│
├── "I was charged twice"
│   ├── Verify in Paystack dashboard
│   ├── If duplicate charge exists → refund via Paystack
│   └── If single charge → explain holding period to buyer
│
├── "I didn't get WhatsApp confirmation"
│   ├── Check MessageLog in database for buyer's phone
│   ├── If FAILED → check WhatsApp API status
│   └── Replay webhook: POST /internal/admin/webhooks/:id/replay
│
├── "Wrong product / wrong price"
│   ├── Check OrderItem in admin dashboard
│   ├── If mismatch → escalate to vendor
│   └── If correct → explain to buyer
│
└── Vendor reports issue
    ├── "I didn't get order notification"
    │   ├── Check SEND_WHATSAPP job status
    │   └── Replay via admin dashboard
    └── "Customer claims payment but I see nothing"
        ├── Check order + payment in admin
        └── If stuck → manually confirm
```

---

## 6. Dispute Handling Policy

### Scope
Tanna is a **payment link platform**, not a marketplace. Disputes are between buyer and vendor.

### Tanna's Role
1. **Provide evidence:** Share order details, payment timestamps, and delivery status from admin dashboard
2. **Facilitate refunds:** If vendor agrees, process refund via Paystack dashboard
3. **Pause abusive vendors:** If repeated complaints, pause store via `POST /internal/admin/vendors/:id/pause`

### Dispute Resolution Process
1. Buyer submits complaint via WhatsApp/email
2. Support checks order in admin dashboard
3. Contact vendor with evidence
4. If vendor agrees to refund → process via Paystack
5. If vendor disputes → escalate to Tanna team
6. Resolution within 48 business hours

### Refund Policy
- Refunds processed within 5-7 business days via Paystack
- Tanna does not hold funds — refunds go through Paystack's system
- No partial refunds (refund full amount or nothing)
