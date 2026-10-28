/**
 * Admin Dashboard HTML Templates
 *
 * Template-literal based server-rendered HTML.
 * No dependencies — pure string concatenation.
 * Minimal CSS, table-based layouts, operational focus.
 */

// ===================
// HELPERS
// ===================

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(date: Date | string | null): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function formatJson(data: unknown): string {
    try {
        return escapeHtml(JSON.stringify(data, null, 2));
    } catch {
        return escapeHtml(String(data));
    }
}

function statusBadge(status: string): string {
    const colors: Record<string, string> = {
        PENDING: '#f59e0b',
        PROCESSING: '#3b82f6',
        COMPLETED: '#10b981',
        FAILED: '#ef4444',
        DEAD: '#6b7280',
        CONFIRMED: '#10b981',
        AWAITING_PAYMENT: '#f59e0b',
        FULFILLED: '#8b5cf6',
        CANCELLED: '#ef4444',
        REFUNDED: '#6b7280',
        SENT: '#10b981',
        HEALTHY: '#10b981',
        STALE: '#ef4444',
        NEVER_STARTED: '#6b7280',
    };
    const color = colors[status] || '#6b7280';
    return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${escapeHtml(status)}</span>`;
}

// ===================
// LAYOUT
// ===================

export function renderLayout(title: string, content: string, adminKey: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Tanna Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  h1 { font-size: 24px; margin-bottom: 20px; color: #f8fafc; }
  h2 { font-size: 18px; margin: 20px 0 10px; color: #cbd5e1; }
  .nav { margin-bottom: 24px; display: flex; gap: 16px; flex-wrap: wrap; }
  .nav a { background: #1e293b; padding: 8px 16px; border-radius: 6px; font-weight: 500; border: 1px solid #334155; }
  .nav a:hover { background: #334155; text-decoration: none; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #1e293b; font-size: 13px; }
  th { background: #1e293b; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
  tr:hover { background: #1e293b40; }
  .card { background: #1e293b; border-radius: 8px; padding: 16px; margin: 12px 0; border: 1px solid #334155; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat { text-align: center; }
  .stat .value { font-size: 28px; font-weight: 700; }
  .stat .label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  pre { background: #0f172a; border: 1px solid #334155; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; line-height: 1.5; max-height: 400px; }
  .btn { display: inline-block; padding: 6px 14px; border-radius: 4px; font-size: 13px; font-weight: 500; border: none; cursor: pointer; text-decoration: none; }
  .btn-primary { background: #3b82f6; color: #fff; }
  .btn-danger { background: #ef4444; color: #fff; }
  .btn-warning { background: #f59e0b; color: #000; }
  .btn:hover { opacity: 0.85; }
  form.inline { display: inline; }
  .filters { background: #1e293b; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .filters label { font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px; }
  .filters select, .filters input { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; padding: 6px 10px; border-radius: 4px; font-size: 13px; }
  .filters button { padding: 6px 16px; background: #3b82f6; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .dl { display: grid; grid-template-columns: 180px 1fr; gap: 4px 16px; }
  .dl dt { color: #94a3b8; font-size: 12px; padding: 4px 0; }
  .dl dd { padding: 4px 0; font-size: 13px; }
  .pagination { margin-top: 16px; display: flex; gap: 8px; }
</style>
</head>
<body>
<nav class="nav">
  <a href="/internal/admin/system?key=${encodeURIComponent(adminKey)}">🏠 Health</a>
  <a href="/internal/admin/jobs?key=${encodeURIComponent(adminKey)}">📋 Jobs</a>
  <a href="/internal/admin/webhooks?key=${encodeURIComponent(adminKey)}">🔗 Webhooks</a>
</nav>
<h1>${escapeHtml(title)}</h1>
${content}
</body>
</html>`;
}

// ===================
// SYSTEM HEALTH
// ===================

interface HealthData {
    timestamp: string;
    worker: { status: string; lastHeartbeat: string | null; metadata: unknown };
    jobs: Record<string, number>;
    alerts: { unprocessedWebhooks: number; stuckJobs: number };
}

export function renderSystemHealth(health: HealthData, adminKey: string): string {
    const content = `
<div class="card-grid">
  <div class="card stat">
    <div class="value">${statusBadge(health.worker.status)}</div>
    <div class="label">Worker Status</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px;">${health.worker.lastHeartbeat ? formatDate(health.worker.lastHeartbeat) : 'Never'}</div>
  </div>
  <div class="card stat">
    <div class="value" style="color:#f59e0b;">${health.jobs.PENDING}</div>
    <div class="label">Pending Jobs</div>
  </div>
  <div class="card stat">
    <div class="value" style="color:#3b82f6;">${health.jobs.PROCESSING}</div>
    <div class="label">Processing Jobs</div>
  </div>
  <div class="card stat">
    <div class="value" style="color:#10b981;">${health.jobs.COMPLETED}</div>
    <div class="label">Completed Jobs</div>
  </div>
  <div class="card stat">
    <div class="value" style="color:#ef4444;">${health.jobs.FAILED}</div>
    <div class="label">Failed Jobs</div>
  </div>
  <div class="card stat">
    <div class="value" style="color:#6b7280;">${health.jobs.DEAD}</div>
    <div class="label">Dead Jobs</div>
  </div>
</div>

<h2>⚠️ Alerts</h2>
<div class="card-grid">
  <div class="card stat">
    <div class="value" style="color:${health.alerts.unprocessedWebhooks > 0 ? '#ef4444' : '#10b981'};">${health.alerts.unprocessedWebhooks}</div>
    <div class="label">Unprocessed Webhooks (&gt;60s)</div>
  </div>
  <div class="card stat">
    <div class="value" style="color:${health.alerts.stuckJobs > 0 ? '#ef4444' : '#10b981'};">${health.alerts.stuckJobs}</div>
    <div class="label">Stuck Jobs (&gt;2min)</div>
  </div>
</div>

<p style="margin-top:16px;font-size:12px;color:#64748b;">Snapshot at ${escapeHtml(health.timestamp)}</p>`;

    return renderLayout('System Health', content, adminKey);
}

// ===================
// JOBS LIST
// ===================

interface JobListItem {
    id: string;
    type: string;
    status: string;
    retryCount: number;
    maxRetries: number;
    availableAt: Date | string;
    lockedBy: string | null;
    lastError: string | null;
    createdAt: Date | string;
}

interface JobsListData {
    data: JobListItem[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
}

export function renderJobsList(
    result: JobsListData,
    filters: Record<string, string>,
    adminKey: string
): string {
    const statuses = ['', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD'];
    const types = ['', 'WEBHOOK_PROCESS', 'SEND_WHATSAPP'];

    const filterForm = `
<form class="filters" method="GET" action="/internal/admin/jobs">
  <input type="hidden" name="key" value="${escapeHtml(adminKey)}">
  <div>
    <label>Status</label>
    <select name="status">
      ${statuses.map(s => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s || 'All'}</option>`).join('')}
    </select>
  </div>
  <div>
    <label>Type</label>
    <select name="type">
      ${types.map(t => `<option value="${t}" ${filters.type === t ? 'selected' : ''}>${t || 'All'}</option>`).join('')}
    </select>
  </div>
  <div>
    <label>Min Retries</label>
    <input type="number" name="retryCount" value="${escapeHtml(filters.retryCount || '')}" min="0" style="width:70px;">
  </div>
  <div>
    <button type="submit">Filter</button>
  </div>
</form>`;

    const rows = result.data.map(job => `
<tr>
  <td><a href="/internal/admin/jobs/${job.id}?key=${encodeURIComponent(adminKey)}">${escapeHtml(job.id.slice(0, 8))}…</a></td>
  <td>${escapeHtml(job.type)}</td>
  <td>${statusBadge(job.status)}</td>
  <td>${job.retryCount}/${job.maxRetries}</td>
  <td>${formatDate(job.availableAt)}</td>
  <td>${job.lockedBy ? escapeHtml(job.lockedBy) : '—'}</td>
  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${job.lastError ? escapeHtml(job.lastError) : '—'}</td>
  <td>${formatDate(job.createdAt)}</td>
</tr>`).join('');

    const pagination = result.hasMore
        ? `<div class="pagination"><a class="btn btn-primary" href="/internal/admin/jobs?cursor=${result.nextCursor}&limit=${filters.limit || '50'}&status=${filters.status || ''}&type=${filters.type || ''}&key=${encodeURIComponent(adminKey)}">Next →</a></div>`
        : '';

    const content = `
<p style="color:#94a3b8;margin-bottom:12px;">${result.total} total jobs</p>
${filterForm}
<table>
  <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Retries</th><th>Available At</th><th>Locked By</th><th>Last Error</th><th>Created</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#64748b;">No jobs found</td></tr>'}</tbody>
</table>
${pagination}`;

    return renderLayout('Jobs', content, adminKey);
}

// ===================
// JOB DETAIL
// ===================

interface JobDetail {
    id: string;
    type: string;
    payload: unknown;
    status: string;
    retryCount: number;
    maxRetries: number;
    availableAt: Date | string;
    lockedAt: Date | string | null;
    lockedBy: string | null;
    lastError: string | null;
    completedAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
}

export function renderJobDetail(job: JobDetail, adminKey: string): string {
    const canRetry = job.status !== 'PROCESSING';
    const canRequeue = job.status === 'DEAD' || job.status === 'FAILED';
    const canMarkDead = !['PROCESSING', 'COMPLETED', 'DEAD'].includes(job.status);

    const actions = `
<div style="display:flex;gap:8px;margin:16px 0;">
  ${canRetry ? `<form class="inline" method="POST" action="/internal/admin/jobs/${job.id}/retry?key=${encodeURIComponent(adminKey)}"><button class="btn btn-primary" type="submit">🔄 Retry</button></form>` : ''}
  ${canRequeue ? `<form class="inline" method="POST" action="/internal/admin/jobs/${job.id}/requeue?key=${encodeURIComponent(adminKey)}"><button class="btn btn-warning" type="submit">♻️ Requeue</button></form>` : ''}
  ${canMarkDead ? `<form class="inline" method="POST" action="/internal/admin/jobs/${job.id}/mark-dead?key=${encodeURIComponent(adminKey)}"><button class="btn btn-danger" type="submit" onclick="return confirm('Mark this job as DEAD?')">💀 Mark Dead</button></form>` : ''}
</div>`;

    const content = `
<div class="card">
  <dl class="dl">
    <dt>ID</dt><dd>${escapeHtml(job.id)}</dd>
    <dt>Type</dt><dd>${escapeHtml(job.type)}</dd>
    <dt>Status</dt><dd>${statusBadge(job.status)}</dd>
    <dt>Retry Count</dt><dd>${job.retryCount} / ${job.maxRetries}</dd>
    <dt>Available At</dt><dd>${formatDate(job.availableAt)}</dd>
    <dt>Locked At</dt><dd>${formatDate(job.lockedAt)}</dd>
    <dt>Locked By</dt><dd>${job.lockedBy ? escapeHtml(job.lockedBy) : '—'}</dd>
    <dt>Last Error</dt><dd style="color:#ef4444;">${job.lastError ? escapeHtml(job.lastError) : '—'}</dd>
    <dt>Completed At</dt><dd>${formatDate(job.completedAt)}</dd>
    <dt>Created At</dt><dd>${formatDate(job.createdAt)}</dd>
    <dt>Updated At</dt><dd>${formatDate(job.updatedAt)}</dd>
  </dl>
</div>
${actions}
<h2>Payload</h2>
<pre>${formatJson(job.payload)}</pre>`;

    return renderLayout(`Job ${job.id.slice(0, 8)}…`, content, adminKey);
}

// ===================
// WEBHOOKS LIST
// ===================

interface WebhookListItem {
    id: string;
    provider: string;
    eventId: string;
    eventType: string;
    processedAt: Date | string | null;
    createdAt: Date | string;
}

interface WebhooksListData {
    data: WebhookListItem[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
}

export function renderWebhooksList(
    result: WebhooksListData,
    filters: Record<string, string>,
    adminKey: string
): string {
    const filterForm = `
<form class="filters" method="GET" action="/internal/admin/webhooks">
  <input type="hidden" name="key" value="${escapeHtml(adminKey)}">
  <div>
    <label>Processed</label>
    <select name="processed">
      <option value="" ${!filters.processed ? 'selected' : ''}>All</option>
      <option value="true" ${filters.processed === 'true' ? 'selected' : ''}>Yes</option>
      <option value="false" ${filters.processed === 'false' ? 'selected' : ''}>No</option>
    </select>
  </div>
  <div>
    <label>Event ID</label>
    <input type="text" name="eventId" value="${escapeHtml(filters.eventId || '')}" placeholder="paystack_xxx">
  </div>
  <div><button type="submit">Filter</button></div>
</form>`;

    const rows = result.data.map(wh => `
<tr>
  <td><a href="/internal/admin/webhooks/${wh.id}?key=${encodeURIComponent(adminKey)}">${escapeHtml(wh.id.slice(0, 8))}…</a></td>
  <td>${escapeHtml(wh.provider)}</td>
  <td>${escapeHtml(wh.eventId)}</td>
  <td>${escapeHtml(wh.eventType)}</td>
  <td>${wh.processedAt ? statusBadge('COMPLETED') : statusBadge('PENDING')}</td>
  <td>${formatDate(wh.createdAt)}</td>
</tr>`).join('');

    const pagination = result.hasMore
        ? `<div class="pagination"><a class="btn btn-primary" href="/internal/admin/webhooks?cursor=${result.nextCursor}&limit=${filters.limit || '50'}&processed=${filters.processed || ''}&key=${encodeURIComponent(adminKey)}">Next →</a></div>`
        : '';

    const content = `
<p style="color:#94a3b8;margin-bottom:12px;">${result.total} total webhooks</p>
${filterForm}
<table>
  <thead><tr><th>ID</th><th>Provider</th><th>Event ID</th><th>Event Type</th><th>Status</th><th>Created</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#64748b;">No webhooks found</td></tr>'}</tbody>
</table>
${pagination}`;

    return renderLayout('Webhooks', content, adminKey);
}

// ===================
// WEBHOOK DETAIL
// ===================

interface WebhookDetail {
    id: string;
    provider: string;
    eventId: string;
    eventType: string;
    rawPayload: unknown;
    processedAt: Date | string | null;
    createdAt: Date | string;
    linkedJob: { id: string; status: string; retryCount: number; createdAt: Date | string; completedAt: Date | string | null; lastError: string | null } | null;
    relatedOrder: { id: string; status: string } | null;
}

export function renderWebhookDetail(webhook: WebhookDetail, adminKey: string): string {
    const linked = webhook.linkedJob
        ? `<div class="card">
  <h2>🔗 Linked Job</h2>
  <dl class="dl">
    <dt>Job ID</dt><dd><a href="/internal/admin/jobs/${webhook.linkedJob.id}?key=${encodeURIComponent(adminKey)}">${escapeHtml(webhook.linkedJob.id.slice(0, 8))}…</a></dd>
    <dt>Status</dt><dd>${statusBadge(webhook.linkedJob.status)}</dd>
    <dt>Error</dt><dd style="color:#ef4444;">${webhook.linkedJob.lastError ? escapeHtml(webhook.linkedJob.lastError) : '—'}</dd>
  </dl>
</div>`
        : '<p style="color:#64748b;">No linked job found</p>';

    const order = webhook.relatedOrder
        ? `<div class="card">
  <h2>📦 Related Order</h2>
  <dl class="dl">
    <dt>Order ID</dt><dd><a href="/internal/admin/orders/${webhook.relatedOrder.id}?key=${encodeURIComponent(adminKey)}">${escapeHtml(webhook.relatedOrder.id.slice(0, 8))}…</a></dd>
    <dt>Status</dt><dd>${statusBadge(webhook.relatedOrder.status)}</dd>
  </dl>
</div>`
        : '';

    const content = `
<div class="card">
  <dl class="dl">
    <dt>ID</dt><dd>${escapeHtml(webhook.id)}</dd>
    <dt>Provider</dt><dd>${escapeHtml(webhook.provider)}</dd>
    <dt>Event ID</dt><dd>${escapeHtml(webhook.eventId)}</dd>
    <dt>Event Type</dt><dd>${escapeHtml(webhook.eventType)}</dd>
    <dt>Processed At</dt><dd>${formatDate(webhook.processedAt)}</dd>
    <dt>Created At</dt><dd>${formatDate(webhook.createdAt)}</dd>
  </dl>
</div>
${linked}
${order}
<h2>Raw Payload</h2>
<pre>${formatJson(webhook.rawPayload)}</pre>`;

    return renderLayout(`Webhook ${webhook.eventId}`, content, adminKey);
}

// ===================
// ORDER RECONCILIATION
// ===================

interface OrderReconciliation {
    order: {
        id: string;
        vendorId: string;
        status: string;
        buyerPhone: string;
        totalAmountKobo: number;
        createdAt: Date | string;
        confirmedAt: Date | string | null;
        fulfilledAt: Date | string | null;
    };
    payment: {
        id: string;
        internalRef: string;
        amountKobo: number;
        status: string;
        paystackRef: string | null;
        verifiedAt: Date | string | null;
        failedAt: Date | string | null;
        failureReason: string | null;
    } | null;
    items: Array<{ id: string; productName: string; unitPriceKobo: number; quantity: number }>;
    webhookJobs: Array<{ id: string; status: string; type: string; retryCount: number; lastError: string | null }>;
    notificationJobs: Array<{ id: string; status: string; type: string; retryCount: number; lastError: string | null }>;
    messageLogs: Array<{ id: string; recipientPhone: string; templateName: string; status: string; errorMessage: string | null; createdAt: Date | string; sentAt: Date | string | null }>;
}

export function renderOrderDetail(data: OrderReconciliation, adminKey: string): string {
    const { order, payment, items, webhookJobs, notificationJobs, messageLogs } = data;

    const itemRows = items.map(i => `
<tr>
  <td>${escapeHtml(i.productName)}</td>
  <td>₦${(i.unitPriceKobo / 100).toLocaleString()}</td>
  <td>${i.quantity}</td>
  <td>₦${((i.unitPriceKobo * i.quantity) / 100).toLocaleString()}</td>
</tr>`).join('');

    const jobRows = (jobs: Array<{ id: string; status: string; type: string; retryCount: number; lastError: string | null }>, label: string) => {
        if (jobs.length === 0) return `<p style="color:#64748b;">No ${label} found</p>`;
        return `<table>
  <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Retries</th><th>Error</th></tr></thead>
  <tbody>
    ${jobs.map(j => `<tr>
      <td><a href="/internal/admin/jobs/${j.id}?key=${encodeURIComponent(adminKey)}">${escapeHtml(j.id.slice(0, 8))}…</a></td>
      <td>${escapeHtml(j.type)}</td>
      <td>${statusBadge(j.status)}</td>
      <td>${j.retryCount}</td>
      <td style="color:#ef4444;">${j.lastError ? escapeHtml(j.lastError) : '—'}</td>
    </tr>`).join('')}
  </tbody>
</table>`;
    };

    const msgRows = messageLogs.length > 0
        ? `<table>
  <thead><tr><th>Template</th><th>Recipient</th><th>Status</th><th>Error</th><th>Sent At</th></tr></thead>
  <tbody>
    ${messageLogs.map(m => `<tr>
      <td>${escapeHtml(m.templateName)}</td>
      <td>${escapeHtml(m.recipientPhone)}</td>
      <td>${statusBadge(m.status)}</td>
      <td style="color:#ef4444;">${m.errorMessage ? escapeHtml(m.errorMessage) : '—'}</td>
      <td>${formatDate(m.sentAt)}</td>
    </tr>`).join('')}
  </tbody>
</table>`
        : '<p style="color:#64748b;">No message logs</p>';

    const content = `
<div class="card">
  <h2>📦 Order</h2>
  <dl class="dl">
    <dt>Order ID</dt><dd>${escapeHtml(order.id)}</dd>
    <dt>Vendor ID</dt><dd>${escapeHtml(order.vendorId)}</dd>
    <dt>Status</dt><dd>${statusBadge(order.status)}</dd>
    <dt>Buyer Phone</dt><dd>${escapeHtml(order.buyerPhone)}</dd>
    <dt>Total Amount</dt><dd>₦${(order.totalAmountKobo / 100).toLocaleString()}</dd>
    <dt>Created</dt><dd>${formatDate(order.createdAt)}</dd>
    <dt>Confirmed</dt><dd>${formatDate(order.confirmedAt)}</dd>
    <dt>Fulfilled</dt><dd>${formatDate(order.fulfilledAt)}</dd>
  </dl>
</div>

${payment ? `<div class="card">
  <h2>💳 Payment</h2>
  <dl class="dl">
    <dt>Payment ID</dt><dd>${escapeHtml(payment.id)}</dd>
    <dt>Internal Ref</dt><dd>${escapeHtml(payment.internalRef)}</dd>
    <dt>Amount</dt><dd>₦${(payment.amountKobo / 100).toLocaleString()}</dd>
    <dt>Status</dt><dd>${statusBadge(payment.status)}</dd>
    <dt>Paystack Ref</dt><dd>${payment.paystackRef ? escapeHtml(payment.paystackRef) : '—'}</dd>
    <dt>Verified At</dt><dd>${formatDate(payment.verifiedAt)}</dd>
    <dt>Failed At</dt><dd>${formatDate(payment.failedAt)}</dd>
    <dt>Failure Reason</dt><dd style="color:#ef4444;">${payment.failureReason ? escapeHtml(payment.failureReason) : '—'}</dd>
  </dl>
</div>` : '<div class="card"><p style="color:#64748b;">No payment linked</p></div>'}

<h2>🛒 Items</h2>
<table>
  <thead><tr><th>Product</th><th>Unit Price</th><th>Qty</th><th>Subtotal</th></tr></thead>
  <tbody>${itemRows || '<tr><td colspan="4" style="color:#64748b;">No items</td></tr>'}</tbody>
</table>

<h2>🔗 Webhook Processing Jobs</h2>
${jobRows(webhookJobs, 'webhook jobs')}

<h2>📱 Notification Jobs</h2>
${jobRows(notificationJobs, 'notification jobs')}

<h2>📨 Message Logs</h2>
${msgRows}`;

    return renderLayout(`Order ${order.id.slice(0, 8)}…`, content, adminKey);
}
