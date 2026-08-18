import type {
  MvpRunnerEvent,
  MvpRunnerJob,
  MvpRunnerJobStatus,
  MvpRunnerJobType,
} from "./mvp-runner-types";
import { nowIso } from "./mvp-runner-types";

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export type MvpRunnerJobRow = {
  id: string;
  type: string;
  status: string;
  survey_id: string | null;
  survey_key: string | null;
  payload_json: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
  locked_by: string | null;
  finished_at: string | null;
};

export type MvpRunnerEventRow = {
  id: string;
  job_id: string;
  type: string;
  message: string;
  data_json: string | null;
  created_at: string;
};

export type CreateMvpRunnerJobInput = {
  id: string;
  type: MvpRunnerJobType;
  surveyId?: string | null;
  surveyKey?: string | null;
  payload: unknown;
  maxAttempts?: number;
};

export type AppendMvpRunnerEventInput = {
  id: string;
  jobId: string;
  type: string;
  message: string;
  data?: unknown;
  createdAt?: string;
};

export type ClaimNextMvpRunnerJobInput = {
  runnerId: string;
  jobTypes?: MvpRunnerJobType[];
};

export class D1MvpRunnerStore {
  constructor(private readonly db: D1DatabaseLike) {}

  async createJob(input: CreateMvpRunnerJobInput): Promise<void> {
    const now = nowIso();

    await this.db
      .prepare(
        `
        INSERT INTO mvp_runner_jobs (
          id,
          type,
          status,
          survey_id,
          survey_key,
          payload_json,
          attempts,
          max_attempts,
          last_error,
          created_at,
          updated_at,
          locked_at,
          locked_by,
          finished_at
        )
        VALUES (?, ?, 'pending', ?, ?, ?, 0, ?, NULL, ?, ?, NULL, NULL, NULL)
        `,
      )
      .bind(
        input.id,
        input.type,
        input.surveyId ?? null,
        input.surveyKey ?? null,
        JSON.stringify(input.payload),
        input.maxAttempts ?? 3,
        now,
        now,
      )
      .run();
  }

  async getJob(jobId: string): Promise<MvpRunnerJobRow | null> {
    return this.db
      .prepare(
        `
        SELECT *
        FROM mvp_runner_jobs
        WHERE id = ?
        LIMIT 1
        `,
      )
      .bind(jobId)
      .first<MvpRunnerJobRow>();
  }

  async listRecentJobs(limit = 20): Promise<MvpRunnerJobRow[]> {
    const result = await this.db
      .prepare(
        `
        SELECT *
        FROM mvp_runner_jobs
        ORDER BY created_at DESC
        LIMIT ?
        `,
      )
      .bind(limit)
      .all<MvpRunnerJobRow>();

    return result.results ?? [];
  }

  async claimNextJob(
    input: ClaimNextMvpRunnerJobInput,
  ): Promise<MvpRunnerJobRow | null> {
    const now = nowIso();
    const jobTypes = input.jobTypes ?? [
      "create_survey_mvp",
      "finalize_survey_mvp",
      "sync_survey_mvp",
    ];

    const placeholders = jobTypes.map(() => "?").join(",");

    const nextJob = await this.db
      .prepare(
        `
        SELECT *
        FROM mvp_runner_jobs
        WHERE status = 'pending'
          AND attempts < max_attempts
          AND type IN (${placeholders})
        ORDER BY created_at ASC
        LIMIT 1
        `,
      )
      .bind(...jobTypes)
      .first<MvpRunnerJobRow>();

    if (!nextJob) {
      return null;
    }

    await this.db
      .prepare(
        `
        UPDATE mvp_runner_jobs
        SET
          status = 'running',
          attempts = attempts + 1,
          locked_at = ?,
          locked_by = ?,
          updated_at = ?
        WHERE id = ?
          AND status = 'pending'
        `,
      )
      .bind(now, input.runnerId, now, nextJob.id)
      .run();

    return this.getJob(nextJob.id);
  }

  async appendEvent(input: AppendMvpRunnerEventInput): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO mvp_runner_events (
          id,
          job_id,
          type,
          message,
          data_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.jobId,
        input.type,
        input.message,
        input.data === undefined ? null : JSON.stringify(input.data),
        input.createdAt ?? nowIso(),
      )
      .run();
  }

  async appendRunnerEvents(events: MvpRunnerEvent[]): Promise<void> {
    for (let i = 0; i < events.length; i += 1) {
      const runnerEvent = events[i];

      await this.appendEvent({
        id: `${runnerEvent.jobId}_${runnerEvent.type}_${i}_${Date.now()}`,
        jobId: runnerEvent.jobId,
        type: runnerEvent.type,
        message: runnerEvent.message,
        data: runnerEvent.data,
        createdAt: runnerEvent.createdAt,
      });
    }
  }

  async listEventsForJob(jobId: string): Promise<MvpRunnerEventRow[]> {
    const result = await this.db
      .prepare(
        `
        SELECT *
        FROM mvp_runner_events
        WHERE job_id = ?
        ORDER BY created_at ASC
        `,
      )
      .bind(jobId)
      .all<MvpRunnerEventRow>();

    return result.results ?? [];
  }

  async markJobDone(jobId: string): Promise<void> {
    const now = nowIso();

    await this.db
      .prepare(
        `
        UPDATE mvp_runner_jobs
        SET
          status = 'done',
          updated_at = ?,
          finished_at = ?,
          last_error = NULL
        WHERE id = ?
        `,
      )
      .bind(now, now, jobId)
      .run();
  }

  async markJobFailed(jobId: string, error: string): Promise<void> {
    const now = nowIso();

    await this.db
      .prepare(
        `
        UPDATE mvp_runner_jobs
        SET
          status = CASE
            WHEN attempts >= max_attempts THEN 'failed'
            ELSE 'pending'
          END,
          updated_at = ?,
          last_error = ?,
          locked_at = NULL,
          locked_by = NULL,
          finished_at = CASE
            WHEN attempts >= max_attempts THEN ?
            ELSE NULL
          END
        WHERE id = ?
        `,
      )
      .bind(now, error, now, jobId)
      .run();
  }

  async forceJobStatus(
    jobId: string,
    status: MvpRunnerJobStatus,
    error?: string | null,
  ): Promise<void> {
    const now = nowIso();

    await this.db
      .prepare(
        `
        UPDATE mvp_runner_jobs
        SET
          status = ?,
          updated_at = ?,
          last_error = ?,
          finished_at = CASE
            WHEN ? IN ('done', 'failed') THEN ?
            ELSE finished_at
          END
        WHERE id = ?
        `,
      )
      .bind(status, now, error ?? null, status, now, jobId)
      .run();
  }

  rowToRunnerJob(row: MvpRunnerJobRow): MvpRunnerJob {
    return {
      id: row.id,
      type: row.type as MvpRunnerJob["type"],
      status: row.status as MvpRunnerJob["status"],
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastError: row.last_error,
      payload: JSON.parse(row.payload_json),
    } as MvpRunnerJob;
  }
}
