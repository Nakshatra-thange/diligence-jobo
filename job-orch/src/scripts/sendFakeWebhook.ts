import crypto from 'node:crypto';

const [, , providerJobId, status] = process.argv;

if (!providerJobId || !status) {
  console.error('Usage: tsx scripts/sendFakeWebhook.ts <provider_job_id> <status>');
  process.exit(1);
}

const secret = 'dev-secret-replicate';
const eventId = `evt_${Math.random().toString(36).slice(2)}`;

const payload = {
  event_id: eventId,
  provider_job_id: providerJobId,
  status,
  output: status === 'succeeded' ? { url: 'https://fake.example/out.png' } : undefined,
};

const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

const res = await fetch('http://localhost:3000/webhooks/replicate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-signature': signature },
  body,
});

console.log(await res.json());