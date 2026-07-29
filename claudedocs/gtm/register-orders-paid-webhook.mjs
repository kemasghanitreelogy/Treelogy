#!/usr/bin/env node
/**
 * Registrasi webhook orders/paid → GA4 purchase backstop.
 *
 * JALANKAN HANYA SETELAH GA4_API_SECRET terpasang di Vercel
 * (treelogy-wa-sync) dan sudah di-redeploy — kalau tidak, endpoint
 * membalas 500 terus dan Shopify akhirnya menonaktifkan webhook.
 *
 * Pakai:  node claudedocs/gtm/register-orders-paid-webhook.mjs
 * Env:    ADMIN_API_KEY (dibaca dari .env repo Treelogy)
 * Idempoten: skip kalau subscription ORDERS_PAID ke URL yang sama sudah ada.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const STORE = env.STORE_NAME ?? 'treelogymoringa.myshopify.com';
const TOKEN = env.ADMIN_API_KEY;
const CALLBACK = 'https://treelogy-wa-sync.vercel.app/api/ga4-purchase-backstop';

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const existing = await gql(`query ListWebhooks {
  webhookSubscriptions(first: 50) {
    nodes { id topic uri }
  }
}`);
const dup = existing.webhookSubscriptions.nodes.find(
  (w) => w.topic === 'ORDERS_PAID' && w.uri === CALLBACK,
);
if (dup) {
  console.log('Sudah terdaftar, skip:', dup.id);
  process.exit(0);
}

const data = await gql(
  `mutation RegisterGa4Backstop($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }`,
  {
    topic: 'ORDERS_PAID',
    webhookSubscription: {callbackUrl: CALLBACK, format: 'JSON'},
  },
);
const {webhookSubscription, userErrors} = data.webhookSubscriptionCreate;
if (userErrors.length) {
  console.error('userErrors:', JSON.stringify(userErrors, null, 2));
  process.exit(1);
}
console.log('Terdaftar:', webhookSubscription.id, '→', webhookSubscription.uri);
