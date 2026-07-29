import { z } from 'zod';

export const CreateJobSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  provider: z.enum(['replicate', 'elevenlabs']),
  input: z.record(z.unknown()),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export type JobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface Job {
  id: string;
  idempotency_key: string;
  provider: string;
  status: JobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  provider_job_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}