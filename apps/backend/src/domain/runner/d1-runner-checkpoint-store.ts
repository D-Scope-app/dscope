import type { D1DatabaseLike } from "./d1-mvp-runner-store";
import { nowIso } from "./mvp-runner-types";

export type RunnerStepStatus =
  | "none"
  | "started"
  | "submitted"
  | "confirmed"
  | "failed"
  | "skipped";

export type RunnerFlowStatus =
  | "pending"
  | "deploying"
  | "finalizing"
  | "retryable_failed"
  | "failed"
  | "active"
  | "finalized";

export type RunnerCheckpointRow = {
  id: string;
  job_id: string;
  survey_id: string | null;
  survey_key: string | null;
  job_type: string;
  flow_status: string;
  current_step: string;
  factory_status: string;
  factory_tx_hash: string | null;
  factory_address: string | null;
  gate_status: string;
  gate_tx_hash: string | null;
  gate_address: string | null;
  policy_status: string;
  policy_tx_hash: string | null;
  policy_hash: string | null;
  policy_registered: number;
  reward_status: string;
  reward_tx_hash: string | null;
  reward_address: string | null;
  reward_config_status: string;
  reward_config_tx_hash: string | null;
  core_status: string;
  core_tx_hash: string | null;
  core_address: string | null;
  factory_register_status: string;
  factory_register_tx_hash: string | null;
  finalize_reward_status: string;
  finalize_reward_tx_hash: string | null;
  finalize_core_status: string;
  finalize_core_tx_hash: string | null;
  result_hash: string | null;
  distribution_hash: string | null;
  final_participant_count: string | null;
  outputs_json: string | null;
  last_error: string | null;
  retryable: number;
  created_at: string;
  updated_at: string;
};

type RunnerCheckpointWritable = Omit<
  RunnerCheckpointRow,
  "id" | "job_id" | "created_at" | "updated_at"
>;

export type UpsertRunnerCheckpointInput = Partial<{
  surveyId: string | null;
  surveyKey: string | null;
  jobType: string;
  flowStatus: RunnerFlowStatus | string;
  currentStep: string;
  factoryStatus: RunnerStepStatus | string;
  factoryTxHash: string | null;
  factoryAddress: string | null;
  gateStatus: RunnerStepStatus | string;
  gateTxHash: string | null;
  gateAddress: string | null;
  policyStatus: RunnerStepStatus | string;
  policyTxHash: string | null;
  policyHash: string | null;
  policyRegistered: boolean | number;
  rewardStatus: RunnerStepStatus | string;
  rewardTxHash: string | null;
  rewardAddress: string | null;
  rewardConfigStatus: RunnerStepStatus | string;
  rewardConfigTxHash: string | null;
  coreStatus: RunnerStepStatus | string;
  coreTxHash: string | null;
  coreAddress: string | null;
  factoryRegisterStatus: RunnerStepStatus | string;
  factoryRegisterTxHash: string | null;
  finalizeRewardStatus: RunnerStepStatus | string;
  finalizeRewardTxHash: string | null;
  finalizeCoreStatus: RunnerStepStatus | string;
  finalizeCoreTxHash: string | null;
  resultHash: string | null;
  distributionHash: string | null;
  finalParticipantCount: string | null;
  outputs: unknown | null;
  lastError: string | null;
  retryable: boolean | number;
}>;

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value);
}

function optionalBooleanNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (value === true) return 1;
  if (value === false || value === null) return 0;
  return Number(value) ? 1 : 0;
}

function outputsToJson(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return JSON.stringify(value);
}

function keepBaseWhenUndefined<T>(
  value: T | undefined,
  base: T,
): T {
  return value === undefined ? base : value;
}

function defaultWritable(input: {
  surveyId?: string | null;
  surveyKey?: string | null;
  jobType?: string | null;
}): RunnerCheckpointWritable {
  return {
    survey_id: input.surveyId ?? null,
    survey_key: input.surveyKey ?? null,
    job_type: input.jobType ?? "unknown",
    flow_status: "pending",
    current_step: "pending",
    factory_status: "none",
    factory_tx_hash: null,
    factory_address: null,
    gate_status: "none",
    gate_tx_hash: null,
    gate_address: null,
    policy_status: "none",
    policy_tx_hash: null,
    policy_hash: null,
    policy_registered: 0,
    reward_status: "none",
    reward_tx_hash: null,
    reward_address: null,
    reward_config_status: "none",
    reward_config_tx_hash: null,
    core_status: "none",
    core_tx_hash: null,
    core_address: null,
    factory_register_status: "none",
    factory_register_tx_hash: null,
    finalize_reward_status: "none",
    finalize_reward_tx_hash: null,
    finalize_core_status: "none",
    finalize_core_tx_hash: null,
    result_hash: null,
    distribution_hash: null,
    final_participant_count: null,
    outputs_json: null,
    last_error: null,
    retryable: 0,
  };
}

function mergePatch(
  base: RunnerCheckpointWritable,
  patch: UpsertRunnerCheckpointInput,
): RunnerCheckpointWritable {
  return {
    ...base,
    survey_id: keepBaseWhenUndefined(optionalString(patch.surveyId), base.survey_id),
    survey_key: keepBaseWhenUndefined(optionalString(patch.surveyKey), base.survey_key),
    job_type: optionalString(patch.jobType) ?? base.job_type,
    flow_status: optionalString(patch.flowStatus) ?? base.flow_status,
    current_step: optionalString(patch.currentStep) ?? base.current_step,
    factory_status: optionalString(patch.factoryStatus) ?? base.factory_status,
    factory_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.factoryTxHash), base.factory_tx_hash),
    factory_address:
      keepBaseWhenUndefined(optionalString(patch.factoryAddress), base.factory_address),
    gate_status: optionalString(patch.gateStatus) ?? base.gate_status,
    gate_tx_hash: keepBaseWhenUndefined(optionalString(patch.gateTxHash), base.gate_tx_hash),
    gate_address: keepBaseWhenUndefined(optionalString(patch.gateAddress), base.gate_address),
    policy_status: optionalString(patch.policyStatus) ?? base.policy_status,
    policy_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.policyTxHash), base.policy_tx_hash),
    policy_hash: keepBaseWhenUndefined(optionalString(patch.policyHash), base.policy_hash),
    policy_registered:
      optionalBooleanNumber(patch.policyRegistered) ?? base.policy_registered,
    reward_status: optionalString(patch.rewardStatus) ?? base.reward_status,
    reward_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.rewardTxHash), base.reward_tx_hash),
    reward_address:
      keepBaseWhenUndefined(optionalString(patch.rewardAddress), base.reward_address),
    reward_config_status:
      optionalString(patch.rewardConfigStatus) ?? base.reward_config_status,
    reward_config_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.rewardConfigTxHash), base.reward_config_tx_hash),
    core_status: optionalString(patch.coreStatus) ?? base.core_status,
    core_tx_hash: keepBaseWhenUndefined(optionalString(patch.coreTxHash), base.core_tx_hash),
    core_address: keepBaseWhenUndefined(optionalString(patch.coreAddress), base.core_address),
    factory_register_status:
      optionalString(patch.factoryRegisterStatus) ??
      base.factory_register_status,
    factory_register_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.factoryRegisterTxHash), base.factory_register_tx_hash),
    finalize_reward_status:
      optionalString(patch.finalizeRewardStatus) ??
      base.finalize_reward_status,
    finalize_reward_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.finalizeRewardTxHash), base.finalize_reward_tx_hash),
    finalize_core_status:
      optionalString(patch.finalizeCoreStatus) ?? base.finalize_core_status,
    finalize_core_tx_hash:
      keepBaseWhenUndefined(optionalString(patch.finalizeCoreTxHash), base.finalize_core_tx_hash),
    result_hash: keepBaseWhenUndefined(optionalString(patch.resultHash), base.result_hash),
    distribution_hash:
      keepBaseWhenUndefined(optionalString(patch.distributionHash), base.distribution_hash),
    final_participant_count:
      keepBaseWhenUndefined(optionalString(patch.finalParticipantCount), base.final_participant_count),
    outputs_json: keepBaseWhenUndefined(outputsToJson(patch.outputs), base.outputs_json),
    last_error:
      patch.flowStatus === "active" || patch.flowStatus === "finalized"
        ? null
        : keepBaseWhenUndefined(
            optionalString(patch.lastError),
            base.last_error,
          ),
    retryable: optionalBooleanNumber(patch.retryable) ?? base.retryable,
  };
}

function rowToWritable(row: RunnerCheckpointRow): RunnerCheckpointWritable {
  return {
    survey_id: row.survey_id,
    survey_key: row.survey_key,
    job_type: row.job_type,
    flow_status: row.flow_status,
    current_step: row.current_step,
    factory_status: row.factory_status,
    factory_tx_hash: row.factory_tx_hash,
    factory_address: row.factory_address,
    gate_status: row.gate_status,
    gate_tx_hash: row.gate_tx_hash,
    gate_address: row.gate_address,
    policy_status: row.policy_status,
    policy_tx_hash: row.policy_tx_hash,
    policy_hash: row.policy_hash,
    policy_registered: row.policy_registered,
    reward_status: row.reward_status,
    reward_tx_hash: row.reward_tx_hash,
    reward_address: row.reward_address,
    reward_config_status: row.reward_config_status,
    reward_config_tx_hash: row.reward_config_tx_hash,
    core_status: row.core_status,
    core_tx_hash: row.core_tx_hash,
    core_address: row.core_address,
    factory_register_status: row.factory_register_status,
    factory_register_tx_hash: row.factory_register_tx_hash,
    finalize_reward_status: row.finalize_reward_status,
    finalize_reward_tx_hash: row.finalize_reward_tx_hash,
    finalize_core_status: row.finalize_core_status,
    finalize_core_tx_hash: row.finalize_core_tx_hash,
    result_hash: row.result_hash,
    distribution_hash: row.distribution_hash,
    final_participant_count: row.final_participant_count,
    outputs_json: row.outputs_json,
    last_error: row.last_error,
    retryable: row.retryable,
  };
}

export class D1RunnerCheckpointStore {
  constructor(private readonly db: D1DatabaseLike) {}

  async getCheckpoint(jobId: string): Promise<RunnerCheckpointRow | null> {
    return this.db
      .prepare(
        `
        SELECT *
        FROM mvp_runner_checkpoints
        WHERE job_id = ?
        LIMIT 1
        `,
      )
      .bind(jobId)
      .first<RunnerCheckpointRow>();
  }

  async upsertCheckpoint(
    jobId: string,
    input: UpsertRunnerCheckpointInput,
  ): Promise<RunnerCheckpointRow> {
    const existing = await this.getCheckpoint(jobId);
    const now = nowIso();
    const id = existing?.id ?? `checkpoint_${jobId}`;
    const createdAt = existing?.created_at ?? now;
    const writable = mergePatch(
      existing
        ? rowToWritable(existing)
        : defaultWritable({
            surveyId: input.surveyId ?? null,
            surveyKey: input.surveyKey ?? null,
            jobType: input.jobType ?? "unknown",
          }),
      input,
    );

    await this.db
      .prepare(
        `
        INSERT INTO mvp_runner_checkpoints (
          id,
          job_id,
          survey_id,
          survey_key,
          job_type,
          flow_status,
          current_step,
          factory_status,
          factory_tx_hash,
          factory_address,
          gate_status,
          gate_tx_hash,
          gate_address,
          policy_status,
          policy_tx_hash,
          policy_hash,
          policy_registered,
          reward_status,
          reward_tx_hash,
          reward_address,
          reward_config_status,
          reward_config_tx_hash,
          core_status,
          core_tx_hash,
          core_address,
          factory_register_status,
          factory_register_tx_hash,
          finalize_reward_status,
          finalize_reward_tx_hash,
          finalize_core_status,
          finalize_core_tx_hash,
          result_hash,
          distribution_hash,
          final_participant_count,
          outputs_json,
          last_error,
          retryable,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          survey_id = excluded.survey_id,
          survey_key = excluded.survey_key,
          job_type = excluded.job_type,
          flow_status = excluded.flow_status,
          current_step = excluded.current_step,
          factory_status = excluded.factory_status,
          factory_tx_hash = excluded.factory_tx_hash,
          factory_address = excluded.factory_address,
          gate_status = excluded.gate_status,
          gate_tx_hash = excluded.gate_tx_hash,
          gate_address = excluded.gate_address,
          policy_status = excluded.policy_status,
          policy_tx_hash = excluded.policy_tx_hash,
          policy_hash = excluded.policy_hash,
          policy_registered = excluded.policy_registered,
          reward_status = excluded.reward_status,
          reward_tx_hash = excluded.reward_tx_hash,
          reward_address = excluded.reward_address,
          reward_config_status = excluded.reward_config_status,
          reward_config_tx_hash = excluded.reward_config_tx_hash,
          core_status = excluded.core_status,
          core_tx_hash = excluded.core_tx_hash,
          core_address = excluded.core_address,
          factory_register_status = excluded.factory_register_status,
          factory_register_tx_hash = excluded.factory_register_tx_hash,
          finalize_reward_status = excluded.finalize_reward_status,
          finalize_reward_tx_hash = excluded.finalize_reward_tx_hash,
          finalize_core_status = excluded.finalize_core_status,
          finalize_core_tx_hash = excluded.finalize_core_tx_hash,
          result_hash = excluded.result_hash,
          distribution_hash = excluded.distribution_hash,
          final_participant_count = excluded.final_participant_count,
          outputs_json = excluded.outputs_json,
          last_error = excluded.last_error,
          retryable = excluded.retryable,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        id,
        jobId,
        writable.survey_id,
        writable.survey_key,
        writable.job_type,
        writable.flow_status,
        writable.current_step,
        writable.factory_status,
        writable.factory_tx_hash,
        writable.factory_address,
        writable.gate_status,
        writable.gate_tx_hash,
        writable.gate_address,
        writable.policy_status,
        writable.policy_tx_hash,
        writable.policy_hash,
        writable.policy_registered,
        writable.reward_status,
        writable.reward_tx_hash,
        writable.reward_address,
        writable.reward_config_status,
        writable.reward_config_tx_hash,
        writable.core_status,
        writable.core_tx_hash,
        writable.core_address,
        writable.factory_register_status,
        writable.factory_register_tx_hash,
        writable.finalize_reward_status,
        writable.finalize_reward_tx_hash,
        writable.finalize_core_status,
        writable.finalize_core_tx_hash,
        writable.result_hash,
        writable.distribution_hash,
        writable.final_participant_count,
        writable.outputs_json,
        writable.last_error,
        writable.retryable,
        createdAt,
        now,
      )
      .run();

    const checkpoint = await this.getCheckpoint(jobId);

    if (!checkpoint) {
      throw new Error(`Failed to upsert checkpoint for job '${jobId}'`);
    }

    return checkpoint;
  }
}
