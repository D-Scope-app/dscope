type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

export type MvpParticipantRoutesEnv = {
  dscope_db: D1Database;
};

type ParticipantActivityRow = {
  survey_id: string;
  survey_key: string;
  title: string | null;
  status: string;
  participation_status: string;
  eligible_for_reward: number;
  participated_at: string | null;
  participation_tx_hash: string | null;
  reward_enabled: number | null;
  reward_status: string | null;
  reward_per_participant: string | null;
  claim_status: string | null;
  claim_amount: string | null;
  claim_tx_hash: string | null;
  claimed_at: string | null;
  result_hash: string | null;
  final_participant_count: string | null;
};

type PointsRow = {
  total_points: number | null;
};

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

async function getAll<T>(
  db: D1Database,
  query: string,
  ...values: unknown[]
): Promise<T[]> {
  const result = (await db
    .prepare(query)
    .bind(...values)
    .all<T>()) as D1Result<T>;

  return result.results ?? [];
}

async function getFirst<T>(
  db: D1Database,
  query: string,
  ...values: unknown[]
): Promise<T | null> {
  return db
    .prepare(query)
    .bind(...values)
    .first<T>();
}

function asNumberString(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "0";
}

function toBigIntSafe(value: string | null | undefined): bigint {
  try {
    return BigInt(asNumberString(value));
  } catch {
    return 0n;
  }
}

function serializeActivity(row: ParticipantActivityRow) {
  const claimStatus = row.claim_status ?? "not_claimed";
  const rewardPerParticipant = asNumberString(row.reward_per_participant);
  const claimAmount = asNumberString(row.claim_amount ?? rewardPerParticipant);

  return {
    survey: {
      id: row.survey_id,
      surveyKey: row.survey_key,
      title: row.title ?? row.survey_id,
      status: row.status,
    },
    participation: {
      status: row.participation_status,
      eligibleForReward: row.eligible_for_reward === 1,
      participatedAt: row.participated_at,
      participationTxHash: row.participation_tx_hash,
    },
    reward: {
      rewardEnabled: row.reward_enabled === 1,
      rewardStatus: row.reward_status,
      rewardPerParticipant,
    },
    claim: {
      claimStatus,
      claimAmount,
      claimTxHash: row.claim_tx_hash,
      claimedAt: row.claimed_at,
    },
    result: {
      resultHash: row.result_hash,
      finalParticipantCount: row.final_participant_count,
    },
  };
}

export async function handleMvpParticipantRoutes(
  request: Request,
  env: MvpParticipantRoutesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/mvp/participants")) {
    return null;
  }

  const parts = getPathParts(url);

  // GET /mvp/participants/:participantRef/activity
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "participants" &&
    parts[3] === "activity"
  ) {
    const participantRef = decodeURIComponent(parts[2]).trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef is required",
      );
    }

    const rows = await getAll<ParticipantActivityRow>(
      env.dscope_db,
      `
      SELECT
        p.survey_id,
        p.survey_key,
        COALESCE(m.title, s.title) AS title,
        s.status,
        p.participation_status,
        p.eligible_for_reward,
        p.participated_at,
        p.participation_tx_hash,
        r.reward_enabled,
        r.reward_status,
        r.reward_per_participant,
        c.claim_status,
        c.claim_amount,
        c.claim_tx_hash,
        c.claimed_at,
        res.result_hash,
        res.final_participant_count
      FROM mvp_participation_records p
      LEFT JOIN mvp_surveys s ON s.id = p.survey_id
      LEFT JOIN mvp_survey_metadata m ON m.survey_id = p.survey_id
      LEFT JOIN mvp_survey_rewards r ON r.survey_id = p.survey_id
      LEFT JOIN mvp_reward_claims c
        ON c.survey_id = p.survey_id
       AND c.participant_ref = p.participant_ref
      LEFT JOIN mvp_survey_results res ON res.survey_id = p.survey_id
      WHERE p.participant_ref = ?
      ORDER BY COALESCE(p.participated_at, p.created_at) DESC
      LIMIT 100
      `,
      participantRef,
    );

    const points = await getFirst<PointsRow>(
      env.dscope_db,
      `
      SELECT COALESCE(SUM(points_delta), 0) AS total_points
      FROM mvp_points_ledger
      WHERE participant_ref = ?
      `,
      participantRef,
    );

    const completedSurveys = rows.filter(
      (row) => row.participation_status === "participated",
    ).length;

    const claimableRows = rows.filter((row) => {
      const amount = toBigIntSafe(row.claim_amount ?? row.reward_per_participant);
      const claimStatus = row.claim_status ?? "not_claimed";

      return (
        row.reward_enabled === 1 &&
        row.reward_status === "FINALIZED" &&
        row.eligible_for_reward === 1 &&
        claimStatus === "not_claimed" &&
        amount > 0n
      );
    });

    const totalClaimableAmount = claimableRows.reduce(
      (sum, row) => sum + toBigIntSafe(row.claim_amount ?? row.reward_per_participant),
      0n,
    );

    return jsonResponse({
      ok: true,
      participant: {
        participantRef,
        profileSource: "derived_from_wallet_activity",
      },
      summary: {
        completedSurveys,
        claimableRewardsCount: claimableRows.length,
        totalClaimableAmount: totalClaimableAmount.toString(),
        totalPoints: Number(points?.total_points ?? 0),
      },
      activity: rows.map(serializeActivity),
    });
  }

  return errorResponse(
    404,
    "mvp_participant_route_not_found",
    "MVP participant route not found",
  );
}
