import type {
  DecisionSource,
  EligibilityStatus,
  VerificationSessionStatus,
} from "../domain/verification/types";

export async function getVerificationSessionById(db: D1Database, id: string) {
  return db
    .prepare("SELECT * FROM verification_sessions WHERE id = ?")
    .bind(id)
    .first<any>();
}

export async function createVerificationSession(
  db: D1Database,
  input: {
    id: string;
    surveyId: string;
    walletAddress: string;
    status: VerificationSessionStatus;
    provider?: string;
    zkRequestId?: string | null;
    subjectHash?: string | null;
    reusedOutcomeId?: string | null;
    validUntil?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt?: string | null;
  },
) {
  const provider = input.provider ?? "zkpassport";

  await db
    .prepare(
      `
      INSERT INTO verification_sessions (
        id,
        survey_id,
        wallet_address,
        provider,
        status,
        zk_request_id,
        subject_hash,
        reused_outcome_id,
        valid_until,
        error_code,
        error_message,
        created_at,
        updated_at,
        completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      input.id,
      input.surveyId,
      input.walletAddress,
      provider,
      input.status,
      input.zkRequestId ?? null,
      input.subjectHash ?? null,
      input.reusedOutcomeId ?? null,
      input.validUntil ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.createdAt,
      input.updatedAt,
      input.completedAt ?? null,
    )
    .run();

  return getVerificationSessionById(db, input.id);
}

export async function updateVerificationSession(
  db: D1Database,
  input: {
    id: string;
    status: VerificationSessionStatus;
    subjectHash?: string | null;
    reusedOutcomeId?: string | null;
    validUntil?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    updatedAt: string;
    completedAt?: string | null;
  },
) {
  await db
    .prepare(
      `
      UPDATE verification_sessions
      SET status = ?,
          subject_hash = COALESCE(?, subject_hash),
          reused_outcome_id = COALESCE(?, reused_outcome_id),
          valid_until = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?,
          completed_at = ?
      WHERE id = ?
    `,
    )
    .bind(
      input.status,
      input.subjectHash ?? null,
      input.reusedOutcomeId ?? null,
      input.validUntil ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.updatedAt,
      input.completedAt ?? null,
      input.id,
    )
    .run();

  return getVerificationSessionById(db, input.id);
}

export async function insertPredicateOutcome(
  db: D1Database,
  input: {
    id: string;
    verificationSessionId: string;
    subjectHash: string;
    source: string;
    verified: number;
    ageBucket: string;
    countryBucket: string;
    worldRegion: string;
    validUntil: string | null;
    policyScope?: string | null;
    providerPayloadVersion?: string | null;
    createdAt: string;
  },
) {
  await db
    .prepare(
      `
      INSERT INTO predicate_outcomes (
        id,
        verification_session_id,
        subject_hash,
        source,
        verified,
        age_bucket,
        country_bucket,
        world_region,
        valid_until,
        policy_scope,
        provider_payload_version,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      input.id,
      input.verificationSessionId,
      input.subjectHash,
      input.source,
      input.verified,
      input.ageBucket,
      input.countryBucket,
      input.worldRegion,
      input.validUntil,
      input.policyScope ?? null,
      input.providerPayloadVersion ?? null,
      input.createdAt,
    )
    .run();

  return db
    .prepare("SELECT * FROM predicate_outcomes WHERE id = ?")
    .bind(input.id)
    .first<any>();
}

export async function getEligibilityBySurveyAndWallet(
  db: D1Database,
  surveyId: string,
  walletAddress: string,
) {
  return db
    .prepare(
      `
      SELECT *
      FROM survey_participation_eligibility
      WHERE survey_id = ? AND wallet_address = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .bind(surveyId, walletAddress)
    .first<any>();
}

export async function upsertSurveyParticipationEligibility(
  db: D1Database,
  input: {
    id: string;
    surveyId: string;
    walletAddress: string;
    subjectHash: string;
    predicateOutcomeId: string;
    eligibilityStatus: EligibilityStatus;
    reasonCode: string | null;
    decisionSource: DecisionSource;
    createdAt: string;
    updatedAt: string;
    consumedAt?: string | null;
  },
) {
  const existing = await getEligibilityBySurveyAndWallet(
    db,
    input.surveyId,
    input.walletAddress,
  );

  if (existing) {
    await db
      .prepare(
        `
        UPDATE survey_participation_eligibility
        SET subject_hash = ?,
            predicate_outcome_id = ?,
            eligibility_status = ?,
            reason_code = ?,
            decision_source = ?,
            consumed_at = ?,
            updated_at = ?
        WHERE id = ?
      `,
      )
      .bind(
        input.subjectHash,
        input.predicateOutcomeId,
        input.eligibilityStatus,
        input.reasonCode,
        input.decisionSource,
        input.consumedAt ?? null,
        input.updatedAt,
        existing.id,
      )
      .run();

    return getEligibilityBySurveyAndWallet(
      db,
      input.surveyId,
      input.walletAddress,
    );
  }

  await db
    .prepare(
      `
      INSERT INTO survey_participation_eligibility (
        id,
        survey_id,
        wallet_address,
        subject_hash,
        predicate_outcome_id,
        eligibility_status,
        reason_code,
        decision_source,
        consumed_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      input.id,
      input.surveyId,
      input.walletAddress,
      input.subjectHash,
      input.predicateOutcomeId,
      input.eligibilityStatus,
      input.reasonCode,
      input.decisionSource,
      input.consumedAt ?? null,
      input.createdAt,
      input.updatedAt,
    )
    .run();

  return getEligibilityBySurveyAndWallet(
    db,
    input.surveyId,
    input.walletAddress,
  );
}

export async function getLatestReusableOutcomeBySubjectHash(
  db: D1Database,
  subjectHash: string,
) {
  return db
    .prepare(
      `
      SELECT *
      FROM predicate_outcomes
      WHERE subject_hash = ? AND verified = 1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .bind(subjectHash)
    .first<any>();
}

export async function getPredicateAggregatesBySurveyId(
  db: D1Database,
  surveyId: string,
) {
  const result = await db
    .prepare(
      `
      SELECT id, survey_id, dimension_type, dimension_value, respondent_count, updated_at
      FROM survey_predicate_aggregates
      WHERE survey_id = ?
      ORDER BY dimension_type, dimension_value
    `,
    )
    .bind(surveyId)
    .all();

  return result.results;
}

export async function incrementSurveyPredicateAggregate(
  db: D1Database,
  input: {
    surveyId: string;
    dimensionType: string;
    dimensionValue: string;
    now: string;
    idFactory: () => string;
  },
) {
  const existing = await db
    .prepare(
      `
      SELECT id, respondent_count
      FROM survey_predicate_aggregates
      WHERE survey_id = ? AND dimension_type = ? AND dimension_value = ?
    `,
    )
    .bind(input.surveyId, input.dimensionType, input.dimensionValue)
    .first<any>();

  if (existing) {
    await db
      .prepare(
        `
        UPDATE survey_predicate_aggregates
        SET respondent_count = ?,
            updated_at = ?
        WHERE id = ?
      `,
      )
      .bind(Number(existing.respondent_count || 0) + 1, input.now, existing.id)
      .run();

    return;
  }

  await db
    .prepare(
      `
      INSERT INTO survey_predicate_aggregates (
        id,
        survey_id,
        dimension_type,
        dimension_value,
        respondent_count,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      input.idFactory(),
      input.surveyId,
      input.dimensionType,
      input.dimensionValue,
      1,
      input.now,
    )
    .run();
}
