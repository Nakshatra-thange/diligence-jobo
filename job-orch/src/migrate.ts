import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db.js';

async function migrate() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'src', 'schema.sql'),
    'utf-8'
  );

  // gen_random_uuid() needs pgcrypto on older Postgres (Postgres 13+ has it built in as of 13, but this is a safe no-op if already enabled)
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(sql);

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});