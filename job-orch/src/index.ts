import express from 'express';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { CreateJobSchema } from './types.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// POSTGRES UNIQUE_VIOLATION error code
const UNIQUE_VIOLATION = '23505';

app.post('/jobs', async (req, res) => {
  const parsed = CreateJobSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.flatten(),
    });
  }

  const { idempotency_key, provider, input } = parsed.data;

  try {
    // Optimistic insert — the UNIQUE constraint on idempotency_key
    // is the actual safety mechanism, not this code.
    const insertResult = await pool.query(
      `INSERT INTO jobs (idempotency_key, provider, input)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [idempotency_key, provider, input]
    );

    return res.status(201).json({
      job: insertResult.rows[0],
      replayed: false,
    });
  } catch (err: any) {
    if (err.code === UNIQUE_VIOLATION) {
      // Same idempotency key submitted before — return the
      // existing job instead of creating a duplicate or erroring.
      const existing = await pool.query(
        `SELECT * FROM jobs WHERE idempotency_key = $1`,
        [idempotency_key]
      );

      return res.status(200).json({
        job: existing.rows[0],
        replayed: true,
      });
    }

    console.error('Failed to create job:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/jobs/:id', async (req, res) => {
  const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [
    req.params.id,
  ]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'not_found' });
  }

  return res.json({ job: result.rows[0] });
});

app.listen(PORT, () => {
  console.log(`AI Job Orchestrator listening on port ${PORT}`);
});