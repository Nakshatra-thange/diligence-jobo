import { Router } from 'express';
import { pool } from '../db.js';
import { verifySignature } from './verifySignature.js';
import { applyProviderEvent } from './applyEvent.js';

export const webhookRouter = Router();

const WEBHOOK_SECRETS: Record<string, string> = {
  replicate: process.env.WEBHOOK_SECRET_REPLICATE || 'dev-secret-replicate',
  elevenlabs: process.env.WEBHOOK_SECRET_ELEVENLABS || 'dev-secret-elevenlabs',
};

webhookRouter.post('/webhooks/:provider', async (req, res) => {
  const provider = req.params.provider;
  const secret = WEBHOOK_SECRETS[provider];

  if (!secret) {
    return res.status(404).json({ error: 'unknown_provider' });
  }

  // req.rawBody is populated by the verify hook wired up in index.ts —
  // signature must be computed over the exact raw bytes, not the
  // re-serialized JSON, or it won't match what the provider signed.
  const rawBody = (req as any).rawBody as Buffer;
  const signature = req.header('x-signature');

  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const { event_id, provider_job_id, status, output, error_message } = req.body;

  if (!event_id || !provider_job_id || !status) {
    return res.status(400).json({ error: 'malformed_payload' });
  }

  const inserted = await pool.query(
    `INSERT INTO webhook_events (provider, provider_event_id, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_event_id) DO NOTHING
     RETURNING id`,
    [provider, event_id, req.body]
  );

  if (inserted.rows.length === 0) {
    console.log(`Duplicate webhook event ignored: ${provider}/${event_id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    await applyProviderEvent({
      provider,
      providerJobId: provider_job_id,
      status,
      output,
      errorMessage: error_message,
    });
    return res.status(200).json({ received: true, duplicate: false });
  } catch (err) {
    console.error('Failed to apply webhook event:', err);
    // Still 200 here would be wrong — we want the provider to retry
    // delivery if our processing genuinely failed (e.g. DB was down).
    return res.status(500).json({ error: 'processing_failed' });
  }
});