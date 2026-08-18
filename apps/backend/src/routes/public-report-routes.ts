export type PublicReportRoutesEnv = {
  dscope_db: D1Database;
  APP_ORIGIN?: string;
};

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

type CreatorSessionWorkspaceRow = {
  account_id: string;
  email: string;
  workspace_id: string | null;
  organization_name: string | null;
  contact_email: string | null;
};

type SurveyPublicationRow = {
  id: string;
  survey_key: string;
  sponsor: string | null;
  title: string | null;
  status: string;
  creator_workspace_id: string | null;
  creator_display_name: string | null;
  metadata_title: string | null;
  metadata_description: string | null;
  result_hash: string | null;
  distribution_hash: string | null;
  final_participant_count: string | null;
  analytics_payload_json: string | null;
  result_updated_at: string | null;
  finalized_at: number | null;
};

type PublicReportRow = {
  survey_id: string;
  slug: string;
  status: string;
  snapshot_json: string | null;
  share_image_base64: string | null;
  published_by_workspace_id: string;
  published_at: string | null;
  unpublished_at: string | null;
  created_at: string;
  updated_at: string;
};

type PublicChoice = {
  value: string;
  label: string;
  count: number;
  percentage: number;
  suppressed: boolean;
};

type PublicQuestionResult = {
  questionId: string;
  title: string;
  type: string;
  totalSelections: number;
  choices: PublicChoice[];
};

type PublicReportSnapshot = {
  version: 1;
  kind: "dscope_public_research_report";
  surveyId: string;
  surveyKey: string;
  slug: string;
  title: string;
  description: string | null;
  creatorDisplayName: string;
  publishedAt: string;
  finalizedAt: string | null;
  finalParticipantCount: number;
  resultHash: string | null;
  distributionHash: string | null;
  analytics: {
    totalValidParticipants: number;
    questionResults: PublicQuestionResult[];
    byAgeBucket: Record<string, number>;
    byCountry: Record<string, number>;
    byRegion: Record<string, number>;
    privacy: {
      minTotalSample: number;
      minSegmentSample: number;
    };
  };
};

const CREATOR_SESSION_COOKIE_NAME = "dscope_creator_session";
const SYSTEM_MIN_TOTAL_SAMPLE = 10;
const SYSTEM_MIN_SEGMENT_SAMPLE = 5;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status);
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseCookieHeader(value: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value) return result;

  for (const part of value.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    result[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return result;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getFirst<T>(
  db: D1Database,
  query: string,
  ...values: unknown[]
): Promise<T | null> {
  return db.prepare(query).bind(...values).first<T>();
}

async function getAuthenticatedWorkspace(
  request: Request,
  db: D1Database,
): Promise<CreatorSessionWorkspaceRow | null> {
  const token = parseCookieHeader(request.headers.get("cookie"))[
    CREATOR_SESSION_COOKIE_NAME
  ];
  if (!token) return null;

  const sessionHash = await sha256Hex(token);
  const now = nowIso();

  return getFirst<CreatorSessionWorkspaceRow>(
    db,
    `
    SELECT
      account.id AS account_id,
      account.email AS email,
      workspace.id AS workspace_id,
      workspace.organization_name AS organization_name,
      workspace.contact_email AS contact_email
    FROM mvp_creator_sessions session
    JOIN mvp_creator_accounts account
      ON account.id = session.creator_account_id
    LEFT JOIN mvp_creator_workspaces workspace
      ON workspace.contact_email = account.email
     AND workspace.status = 'active'
    WHERE session.session_hash = ?
      AND session.revoked_at IS NULL
      AND session.expires_at > ?
    LIMIT 1
    `,
    sessionHash,
    now,
  );
}

async function getSurveyForPublication(
  db: D1Database,
  surveyId: string,
): Promise<SurveyPublicationRow | null> {
  return getFirst<SurveyPublicationRow>(
    db,
    `
    SELECT
      survey.id,
      survey.survey_key,
      survey.sponsor,
      survey.title,
      survey.status,
      survey.creator_workspace_id,
      survey.creator_display_name,
      metadata.title AS metadata_title,
      metadata.description AS metadata_description,
      result.result_hash,
      result.distribution_hash,
      result.final_participant_count,
      result.analytics_payload_json,
      result.updated_at AS result_updated_at,
      legacy.finalized_at AS finalized_at
    FROM mvp_surveys survey
    LEFT JOIN mvp_survey_metadata metadata
      ON metadata.survey_id = survey.id
    LEFT JOIN mvp_survey_results result
      ON result.survey_id = survey.id
    LEFT JOIN surveys legacy
      ON legacy.id = survey.id
    WHERE survey.id = ?
    LIMIT 1
    `,
    surveyId,
  );
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.floor(numeric)
    : fallback;
}

function nonNegativeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.floor(numeric)
    : 0;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function applyMapPrivacyFloor(
  value: unknown,
  minSegmentSample: number,
): Record<string, number> {
  const record = asRecord(value) ?? {};
  const visible: Record<string, number> = {};
  let suppressedTotal = 0;

  for (const [key, rawCount] of Object.entries(record)) {
    const count = nonNegativeInteger(rawCount);
    if (count <= 0) continue;

    if (key === "OTHER_SUPPRESSED" || count < minSegmentSample) {
      suppressedTotal += count;
    } else {
      visible[key] = count;
    }
  }

  if (suppressedTotal > 0) visible.OTHER_SUPPRESSED = suppressedTotal;
  return visible;
}

function buildPublicQuestionResults(
  value: unknown,
  minSegmentSample: number,
): PublicQuestionResult[] {
  if (!Array.isArray(value)) return [];

  return value.map((rawQuestion, questionIndex) => {
    const question = asRecord(rawQuestion) ?? {};
    const rawChoices = Array.isArray(question.choices) ? question.choices : [];
    const visibleChoices: PublicChoice[] = [];
    let suppressedCount = 0;

    for (const rawChoice of rawChoices) {
      const choice = asRecord(rawChoice) ?? {};
      const count = nonNegativeInteger(choice.count);
      if (count <= 0) continue;

      const valueKey = stringValue(choice.value, `choice_${visibleChoices.length}`);
      const isSuppressed =
        choice.suppressed === true ||
        valueKey === "OTHER_SUPPRESSED" ||
        count < minSegmentSample;

      if (isSuppressed) {
        suppressedCount += count;
        continue;
      }

      visibleChoices.push({
        value: valueKey,
        label: stringValue(choice.label, valueKey),
        count,
        percentage: Number(choice.percentage) || 0,
        suppressed: false,
      });
    }

    const totalSelections = Math.max(
      nonNegativeInteger(question.totalSelections),
      visibleChoices.reduce((sum, choice) => sum + choice.count, 0) +
        suppressedCount,
    );

    if (suppressedCount > 0) {
      visibleChoices.push({
        value: "OTHER_SUPPRESSED",
        label: "Hidden by privacy threshold",
        count: suppressedCount,
        percentage:
          totalSelections > 0
            ? Math.round((suppressedCount / totalSelections) * 1000) / 10
            : 0,
        suppressed: true,
      });
    }

    const choices = visibleChoices.map((choice) => ({
      ...choice,
      percentage:
        totalSelections > 0
          ? Math.round((choice.count / totalSelections) * 1000) / 10
          : 0,
    }));

    return {
      questionId: stringValue(question.questionId, `question_${questionIndex + 1}`),
      title: stringValue(question.title, `Question ${questionIndex + 1}`),
      type: stringValue(question.type, "unknown"),
      totalSelections,
      choices,
    };
  });
}

function slugify(value: string): string {
  const normalized = transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "research-report";
}

function randomSlugSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function originFor(request: Request, env: PublicReportRoutesEnv): string {
  const configured = env.APP_ORIGIN?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

function creatorOwnsSurvey(
  auth: CreatorSessionWorkspaceRow,
  survey: SurveyPublicationRow,
): boolean {
  return Boolean(
    auth.workspace_id && survey.creator_workspace_id === auth.workspace_id,
  );
}

function publicCreatorDisplayName(...values: Array<string | null>): string {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized && !normalized.includes("@")) return normalized;
  }
  return "D-Scope Creator";
}

function buildSnapshot(input: {
  survey: SurveyPublicationRow;
  slug: string;
  publishedAt: string;
  creatorDisplayName: string;
}): PublicReportSnapshot {
  const analytics = asRecord(safeJsonParse(input.survey.analytics_payload_json));
  if (!analytics) {
    throw new Error("Finalized analytics payload is missing or invalid.");
  }

  const privacy = asRecord(analytics.privacy) ?? {};
  const minTotalSample = Math.max(
    SYSTEM_MIN_TOTAL_SAMPLE,
    positiveInteger(privacy.minTotalSample, SYSTEM_MIN_TOTAL_SAMPLE),
  );
  const minSegmentSample = Math.max(
    SYSTEM_MIN_SEGMENT_SAMPLE,
    positiveInteger(privacy.minSegmentSample, SYSTEM_MIN_SEGMENT_SAMPLE),
  );
  const totalValidParticipants = nonNegativeInteger(
    analytics.totalValidParticipants ?? input.survey.final_participant_count,
  );

  if (totalValidParticipants < minTotalSample) {
    throw new Error(
      `The finalized sample has ${totalValidParticipants} participants. At least ${minTotalSample} are required for a public privacy-safe report.`,
    );
  }

  return {
    version: 1,
    kind: "dscope_public_research_report",
    surveyId: input.survey.id,
    surveyKey: input.survey.survey_key,
    slug: input.slug,
    title:
      input.survey.metadata_title ?? input.survey.title ?? input.survey.id,
    description: input.survey.metadata_description,
    creatorDisplayName: input.creatorDisplayName,
    publishedAt: input.publishedAt,
    finalizedAt:
      input.survey.finalized_at !== null
        ? new Date(input.survey.finalized_at * 1000).toISOString()
        : input.survey.result_updated_at,
    finalParticipantCount: totalValidParticipants,
    resultHash: input.survey.result_hash,
    distributionHash: input.survey.distribution_hash,
    analytics: {
      totalValidParticipants,
      questionResults: buildPublicQuestionResults(
        analytics.questionResults,
        minSegmentSample,
      ),
      byAgeBucket: applyMapPrivacyFloor(
        analytics.byAgeBucket,
        minSegmentSample,
      ),
      byCountry: applyMapPrivacyFloor(
        analytics.byCountry,
        minSegmentSample,
      ),
      byRegion: applyMapPrivacyFloor(
        analytics.byRegion,
        minSegmentSample,
      ),
      privacy: {
        minTotalSample,
        minSegmentSample,
      },
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function publishReport(
  request: Request,
  env: PublicReportRoutesEnv,
  surveyId: string,
): Promise<Response> {
  const auth = await getAuthenticatedWorkspace(request, env.dscope_db);
  if (!auth?.workspace_id) {
    return errorResponse(401, "creator_login_required", "Creator login is required.");
  }

  const survey = await getSurveyForPublication(env.dscope_db, surveyId);
  if (!survey) {
    return errorResponse(404, "survey_not_found", "Survey not found.");
  }
  if (!creatorOwnsSurvey(auth, survey)) {
    return errorResponse(
      403,
      "public_report_forbidden",
      "Only the creator workspace that owns this survey can publish its report.",
    );
  }
  if (survey.status !== "finalized" || !survey.analytics_payload_json) {
    return errorResponse(
      409,
      "survey_not_finalized",
      "A public report can be published only after successful finalization.",
    );
  }

  const existing = await getFirst<PublicReportRow>(
    env.dscope_db,
    `SELECT * FROM mvp_public_reports WHERE survey_id = ? LIMIT 1`,
    surveyId,
  );

  if (existing?.status === "published" && existing.snapshot_json) {
    const origin = originFor(request, env);
    return jsonResponse({
      ok: true,
      publicReport: {
        status: "published",
        slug: existing.slug,
        url: `${origin}/reports/${encodeURIComponent(existing.slug)}`,
        shareImageUrl: `${origin}/reports/${encodeURIComponent(existing.slug)}/share.png`,
        publishedAt: existing.published_at,
      },
    });
  }

  const publishedAt = nowIso();
  const title = survey.metadata_title ?? survey.title ?? survey.id;
  const slug = `${slugify(title)}-${randomSlugSuffix()}`;

  let snapshot: PublicReportSnapshot;
  try {
    snapshot = buildSnapshot({
      survey,
      slug,
      publishedAt,
      creatorDisplayName:
        publicCreatorDisplayName(
          survey.creator_display_name,
          auth.organization_name,
        ),
    });
  } catch (error) {
    return errorResponse(
      409,
      "public_report_privacy_blocked",
      error instanceof Error ? error.message : "Public report cannot be published.",
    );
  }

  const shareImageBase64 = bytesToBase64(await renderSharePng(snapshot));
  const now = nowIso();
  await env.dscope_db
    .prepare(
      `
      INSERT INTO mvp_public_reports (
        survey_id, slug, status, snapshot_json, share_image_base64,
        published_by_workspace_id, published_at, unpublished_at, created_at, updated_at
      )
      VALUES (?, ?, 'published', ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(survey_id) DO UPDATE SET
        slug = excluded.slug,
        status = 'published',
        snapshot_json = excluded.snapshot_json,
        share_image_base64 = excluded.share_image_base64,
        published_by_workspace_id = excluded.published_by_workspace_id,
        published_at = excluded.published_at,
        unpublished_at = NULL,
        updated_at = excluded.updated_at
      `,
    )
    .bind(
      surveyId,
      slug,
      JSON.stringify(snapshot),
      shareImageBase64,
      auth.workspace_id,
      publishedAt,
      now,
      now,
    )
    .run();

  const origin = originFor(request, env);
  return jsonResponse({
    ok: true,
    publicReport: {
      status: "published",
      slug,
      url: `${origin}/reports/${encodeURIComponent(slug)}`,
      shareImageUrl: `${origin}/reports/${encodeURIComponent(slug)}/share.png`,
      publishedAt,
    },
  });
}

async function unpublishReport(
  request: Request,
  env: PublicReportRoutesEnv,
  surveyId: string,
): Promise<Response> {
  const auth = await getAuthenticatedWorkspace(request, env.dscope_db);
  if (!auth?.workspace_id) {
    return errorResponse(401, "creator_login_required", "Creator login is required.");
  }

  const survey = await getSurveyForPublication(env.dscope_db, surveyId);
  if (!survey) {
    return errorResponse(404, "survey_not_found", "Survey not found.");
  }
  if (!creatorOwnsSurvey(auth, survey)) {
    return errorResponse(
      403,
      "public_report_forbidden",
      "Only the creator workspace that owns this survey can unpublish its report.",
    );
  }

  const now = nowIso();
  await env.dscope_db
    .prepare(
      `
      UPDATE mvp_public_reports
      SET status = 'unpublished',
          snapshot_json = NULL,
          share_image_base64 = NULL,
          unpublished_at = ?,
          updated_at = ?
      WHERE survey_id = ?
        AND published_by_workspace_id = ?
      `,
    )
    .bind(now, now, surveyId, auth.workspace_id)
    .run();

  return jsonResponse({
    ok: true,
    publicReport: {
      status: "unpublished",
      slug: null,
      url: null,
      shareImageUrl: null,
      publishedAt: null,
    },
  });
}

async function getPublishedReport(
  db: D1Database,
  slug: string,
): Promise<{ snapshot: PublicReportSnapshot; shareImageBase64: string } | null> {
  const row = await getFirst<PublicReportRow>(
    db,
    `
    SELECT *
    FROM mvp_public_reports
    WHERE slug = ?
      AND status = 'published'
      AND snapshot_json IS NOT NULL
      AND share_image_base64 IS NOT NULL
    LIMIT 1
    `,
    slug,
  );
  if (!row?.snapshot_json || !row.share_image_base64) return null;

  const snapshot = safeJsonParse(row.snapshot_json);
  return asRecord(snapshot)?.kind === "dscope_public_research_report"
    ? {
        snapshot: snapshot as PublicReportSnapshot,
        shareImageBase64: row.share_image_base64,
      }
    : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBucketLabel(value: string): string {
  if (value === "OTHER_SUPPRESSED") return "Hidden segments";
  if (value === "OTHER_UNKNOWN") return "Other / unknown";
  if (value === "61_PLUS") return "61+";
  if (/^\d+_\d+$/.test(value)) return value.replace("_", "–");
  return value.replaceAll("_", " ");
}

function shortHash(value: string | null): string {
  if (!value) return "not available";
  return value.length > 24
    ? `${value.slice(0, 12)}…${value.slice(-8)}`
    : value;
}

function renderBarRows(rows: Array<[string, number]>): string {
  if (!rows.length) {
    return '<div class="empty">No publishable segments.</div>';
  }
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return rows
    .slice(0, 8)
    .map(([label, count]) => {
      const width = Math.max(4, Math.round((count / max) * 100));
      return `<div class="bar-row"><span>${escapeHtml(formatBucketLabel(label))}</span><div class="track"><i style="width:${width}%"></i></div><strong>${count}</strong></div>`;
    })
    .join("");
}

function renderQuestion(question: PublicQuestionResult, index: number): string {
  const max = Math.max(1, ...question.choices.map((choice) => choice.count));
  const choices = question.choices.length
    ? question.choices
        .map((choice) => {
          const width = Math.max(4, Math.round((choice.count / max) * 100));
          return `<div class="answer-row${choice.suppressed ? " suppressed" : ""}"><span>${escapeHtml(choice.label)}</span><div class="track"><i style="width:${width}%"></i></div><strong>${choice.count} · ${choice.percentage}%</strong></div>`;
        })
        .join("")
    : '<div class="empty">No publishable answer aggregates.</div>';

  return `<article class="question-card"><div class="question-head"><b>${String(index + 1).padStart(2, "0")}</b><div><h3>${escapeHtml(question.title)}</h3><p>${escapeHtml(question.type.replaceAll("_", " "))} · ${question.totalSelections} finalized selections</p></div></div><div class="answer-list">${choices}</div></article>`;
}

function renderPublicReportHtml(
  snapshot: PublicReportSnapshot,
  request: Request,
): string {
  const origin = new URL(request.url).origin;
  const pageUrl = `${origin}/reports/${encodeURIComponent(snapshot.slug)}`;
  const imageUrl = `${pageUrl}/share.png`;
  const description =
    snapshot.description ||
    `Finalized D-Scope research report with ${snapshot.finalParticipantCount} verified participants.`;
  const questions = snapshot.analytics.questionResults
    .map(renderQuestion)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(snapshot.title)} · D-Scope Report</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(snapshot.title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="675" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(snapshot.title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <style>
    :root{color-scheme:dark;--bg:#070a13;--panel:#0e1322;--panel2:#11182a;--line:rgba(255,255,255,.09);--muted:#93a0ba;--text:#f3f6ff;--violet:#6677ff;--cyan:#17c6ec;--green:#6ee7b7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -10%,rgba(91,109,255,.22),transparent 34%),radial-gradient(circle at 100% 10%,rgba(22,198,236,.12),transparent 28%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}.shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:30px 0 70px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:36px}.brand{display:flex;align-items:center;gap:11px;font-weight:900;letter-spacing:.08em}.brand-mark{width:34px;height:34px;border:1px solid rgba(102,119,255,.45);border-radius:11px;background:linear-gradient(145deg,rgba(102,119,255,.25),rgba(23,198,236,.1));display:grid;place-items:center;color:#cbd3ff}.verified{padding:8px 12px;border:1px solid rgba(110,231,183,.25);border-radius:999px;color:var(--green);background:rgba(110,231,183,.07);font-size:12px;font-weight:800}.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:end;padding:30px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025));box-shadow:0 24px 80px rgba(0,0,0,.22)}.eyebrow{color:#8795ff;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5vw,64px);line-height:1.02;letter-spacing:-.05em;margin:10px 0 16px;max-width:860px}.hero p{margin:0;color:var(--muted);font-size:16px;line-height:1.65;max-width:760px}.hero-actions{display:flex;flex-direction:column;gap:10px;min-width:190px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:12px;text-decoration:none;font-weight:850;font-size:13px;border:1px solid var(--line);color:var(--text);background:rgba(255,255,255,.035)}.btn.primary{border-color:rgba(102,119,255,.35);background:linear-gradient(135deg,#5f70ff,#4358ed)}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.metric{padding:16px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.03)}.metric span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}.metric strong{display:block;margin-top:7px;font-size:18px;overflow-wrap:anywhere}.layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(310px,.75fr);gap:14px;align-items:start}.panel{border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.022));padding:18px}.section-head{margin-bottom:14px}.section-head h2{margin:5px 0 4px;font-size:19px}.section-head p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.question-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}.question-card{border:1px solid var(--line);border-radius:15px;padding:13px;background:rgba(255,255,255,.025)}.question-head{display:flex;gap:10px;align-items:center}.question-head>b{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:rgba(102,119,255,.13);color:#cbd3ff;font-size:12px}.question-head h3{margin:0;font-size:15px}.question-head p{margin:3px 0 0;color:var(--muted);font-size:11px;text-transform:capitalize}.answer-list,.bar-list{display:grid;gap:8px;margin-top:13px}.answer-row,.bar-row{display:grid;grid-template-columns:minmax(90px,.8fr) minmax(90px,1.2fr) auto;gap:8px;align-items:center;font-size:12px}.answer-row span,.bar-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:capitalize}.track{height:7px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.07)}.track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--violet),var(--cyan))}.answer-row strong,.bar-row strong{font-size:11px}.answer-row.suppressed{color:#cdb77e}.side{display:grid;gap:12px}.audience-card{border:1px solid var(--line);border-radius:15px;padding:13px;background:rgba(255,255,255,.025)}.audience-card h3{margin:0;font-size:14px}.privacy{margin-top:12px;padding:14px;border:1px solid rgba(102,119,255,.19);border-radius:15px;background:rgba(102,119,255,.055)}.privacy strong{font-size:13px}.privacy p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.5}.empty{padding:14px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:18px;padding:16px 4px;color:#6f7b96;font-size:11px}.footer code{overflow-wrap:anywhere}.noscript{padding:12px;color:#f5c67a}@media(max-width:880px){.hero{grid-template-columns:1fr}.hero-actions{flex-direction:row;min-width:0}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:1fr}}@media(max-width:580px){.shell{width:min(100% - 20px,1180px);padding-top:16px}.topbar{margin-bottom:18px}.hero{padding:20px}.hero-actions{flex-direction:column}.metrics{grid-template-columns:1fr}.question-grid{grid-template-columns:1fr}.answer-row,.bar-row{grid-template-columns:1fr}.footer{flex-direction:column}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar"><div class="brand"><span class="brand-mark">D</span>D-SCOPE</div><span class="verified">FINALIZED · PRIVACY CHECKED</span></header>
    <section class="hero"><div><div class="eyebrow">Public research report</div><h1>${escapeHtml(snapshot.title)}</h1><p>${escapeHtml(description)}</p></div><div class="hero-actions"><a class="btn primary" href="${escapeHtml(imageUrl)}" download>Download share image</a><button class="btn" type="button" onclick="navigator.clipboard.writeText(location.href).then(()=>this.textContent='Link copied')">Copy report link</button></div></section>
    <section class="metrics"><div class="metric"><span>Verified participants</span><strong>${snapshot.finalParticipantCount}</strong></div><div class="metric"><span>Questions</span><strong>${snapshot.analytics.questionResults.length}</strong></div><div class="metric"><span>Creator</span><strong>${escapeHtml(snapshot.creatorDisplayName)}</strong></div><div class="metric"><span>Published</span><strong>${escapeHtml(new Date(snapshot.publishedAt).toLocaleDateString("en-GB"))}</strong></div></section>
    <section class="layout"><div class="panel"><div class="section-head"><div class="eyebrow">01 · Results</div><h2>Question results</h2><p>Finalized aggregate distributions. Individual response records are not published.</p></div><div class="question-grid">${questions || '<div class="empty">No publishable question aggregates.</div>'}</div></div><aside class="side"><div class="panel"><div class="section-head"><div class="eyebrow">02 · Audience</div><h2>Verified audience context</h2><p>Predicate-backed segments that passed publication thresholds.</p></div><div class="audience-card"><h3>Age</h3><div class="bar-list">${renderBarRows(Object.entries(snapshot.analytics.byAgeBucket))}</div></div><div class="audience-card"><h3>Country</h3><div class="bar-list">${renderBarRows(Object.entries(snapshot.analytics.byCountry))}</div></div><div class="audience-card"><h3>Region</h3><div class="bar-list">${renderBarRows(Object.entries(snapshot.analytics.byRegion))}</div></div><div class="privacy"><strong>Privacy controls enforced</strong><p>Minimum total sample: ${snapshot.analytics.privacy.minTotalSample}. Minimum segment sample: ${snapshot.analytics.privacy.minSegmentSample}. Smaller groups are hidden or combined.</p></div></div></aside></section>
    <footer class="footer"><span>Verify the audience. Protect the respondent. Reveal the insight.</span><span>Result: <code>${escapeHtml(shortHash(snapshot.resultHash))}</code></span></footer>
  </main>
</body>
</html>`;
}

const FONT: Record<string, string[]> = {
  " ":["000","000","000","000","000","000","000"],
  "A":["01110","10001","10001","11111","10001","10001","10001"],
  "B":["11110","10001","10001","11110","10001","10001","11110"],
  "C":["01111","10000","10000","10000","10000","10000","01111"],
  "D":["11110","10001","10001","10001","10001","10001","11110"],
  "E":["11111","10000","10000","11110","10000","10000","11111"],
  "F":["11111","10000","10000","11110","10000","10000","10000"],
  "G":["01111","10000","10000","10111","10001","10001","01111"],
  "H":["10001","10001","10001","11111","10001","10001","10001"],
  "I":["11111","00100","00100","00100","00100","00100","11111"],
  "J":["00111","00010","00010","00010","10010","10010","01100"],
  "K":["10001","10010","10100","11000","10100","10010","10001"],
  "L":["10000","10000","10000","10000","10000","10000","11111"],
  "M":["10001","11011","10101","10101","10001","10001","10001"],
  "N":["10001","11001","10101","10011","10001","10001","10001"],
  "O":["01110","10001","10001","10001","10001","10001","01110"],
  "P":["11110","10001","10001","11110","10000","10000","10000"],
  "Q":["01110","10001","10001","10001","10101","10010","01101"],
  "R":["11110","10001","10001","11110","10100","10010","10001"],
  "S":["01111","10000","10000","01110","00001","00001","11110"],
  "T":["11111","00100","00100","00100","00100","00100","00100"],
  "U":["10001","10001","10001","10001","10001","10001","01110"],
  "V":["10001","10001","10001","10001","10001","01010","00100"],
  "W":["10001","10001","10001","10101","10101","10101","01010"],
  "X":["10001","10001","01010","00100","01010","10001","10001"],
  "Y":["10001","10001","01010","00100","00100","00100","00100"],
  "Z":["11111","00001","00010","00100","01000","10000","11111"],
  "0":["01110","10001","10011","10101","11001","10001","01110"],
  "1":["00100","01100","00100","00100","00100","00100","01110"],
  "2":["01110","10001","00001","00010","00100","01000","11111"],
  "3":["11110","00001","00001","01110","00001","00001","11110"],
  "4":["00010","00110","01010","10010","11111","00010","00010"],
  "5":["11111","10000","10000","11110","00001","00001","11110"],
  "6":["01110","10000","10000","11110","10001","10001","01110"],
  "7":["11111","00001","00010","00100","01000","01000","01000"],
  "8":["01110","10001","10001","01110","10001","10001","01110"],
  "9":["01110","10001","10001","01111","00001","00001","01110"],
  "-":["00000","00000","00000","11111","00000","00000","00000"],
  ".":["000","000","000","000","000","110","110"],
  ":":["000","110","110","000","110","110","000"],
  "/":["00001","00010","00100","01000","10000","00000","00000"],
  "%":["11001","11010","00100","01000","10110","00110","00000"],
  "+":["00000","00100","00100","11111","00100","00100","00000"],
  "?":["01110","10001","00001","00010","00100","00000","00100"],
  "(":["001","010","100","100","100","010","001"],
  ")":["100","010","001","001","001","010","100"],
};

function transliterate(value: string): string {
  const map: Record<string, string> = {
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"E",Ж:"ZH",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"KH",Ц:"TS",Ч:"CH",Ш:"SH",Щ:"SCH",Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"YU",Я:"YA",
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  return [...value].map((character) => map[character] ?? character).join("");
}

function parseHexColor(value: string): [number, number, number, number] {
  const normalized = value.replace("#", "");
  const hex = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    255,
  ];
}

class RasterCanvas {
  readonly pixels: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    this.pixels = new Uint8Array(width * height * 4);
  }

  setPixel(x: number, y: number, color: [number, number, number, number]): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const index = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    this.pixels[index] = color[0];
    this.pixels[index + 1] = color[1];
    this.pixels[index + 2] = color[2];
    this.pixels[index + 3] = color[3];
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: [number, number, number, number],
  ): void {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(this.width, Math.ceil(x + width));
    const endY = Math.min(this.height, Math.ceil(y + height));
    for (let py = startY; py < endY; py += 1) {
      for (let px = startX; px < endX; px += 1) this.setPixel(px, py, color);
    }
  }

  gradient(top: string, bottom: string): void {
    const a = parseHexColor(top);
    const b = parseHexColor(bottom);
    for (let y = 0; y < this.height; y += 1) {
      const t = y / Math.max(1, this.height - 1);
      const color: [number, number, number, number] = [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
        255,
      ];
      this.fillRect(0, y, this.width, 1, color);
    }
  }

  drawText(
    value: string,
    x: number,
    y: number,
    scale: number,
    color: [number, number, number, number],
    maxCharacters = 80,
  ): void {
    const text = transliterate(value)
      .toUpperCase()
      .replace(/[^A-Z0-9 .:\/%+?()\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxCharacters);
    let cursorX = x;
    for (const character of text) {
      const glyph = FONT[character] ?? FONT["?"];
      const glyphWidth = glyph[0].length;
      for (let row = 0; row < glyph.length; row += 1) {
        for (let column = 0; column < glyphWidth; column += 1) {
          if (glyph[row][column] !== "1") continue;
          this.fillRect(
            cursorX + column * scale,
            y + row * scale,
            scale,
            scale,
            color,
          );
        }
      }
      cursorX += (glyphWidth + 1) * scale;
    }
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32be(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concatBytes([typeBytes, data]);
  return concatBytes([
    uint32be(data.length),
    typeBytes,
    data,
    uint32be(crc32(crcInput)),
  ]);
}

async function encodePng(canvas: RasterCanvas): Promise<Uint8Array> {
  const scanlines = new Uint8Array(canvas.height * (canvas.width * 4 + 1));
  const stride = canvas.width * 4;
  for (let y = 0; y < canvas.height; y += 1) {
    const targetOffset = y * (stride + 1);
    scanlines[targetOffset] = 0;
    scanlines.set(
      canvas.pixels.subarray(y * stride, (y + 1) * stride),
      targetOffset + 1,
    );
  }

  const compressedStream = new Blob([scanlines])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(
    await new Response(compressedStream).arrayBuffer(),
  );

  const ihdr = concatBytes([
    uint32be(canvas.width),
    uint32be(canvas.height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ]);
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function firstQuestion(snapshot: PublicReportSnapshot): PublicQuestionResult | null {
  return (
    snapshot.analytics.questionResults.find((question) => question.choices.length) ??
    null
  );
}

async function renderSharePng(snapshot: PublicReportSnapshot): Promise<Uint8Array> {
  const canvas = new RasterCanvas(1200, 675);
  canvas.gradient("#080b16", "#111a31");
  canvas.fillRect(0, 0, 12, 675, parseHexColor("#6677ff"));
  canvas.fillRect(12, 0, 5, 675, parseHexColor("#18c6ed"));

  const white = parseHexColor("#f3f6ff");
  const muted = parseHexColor("#94a0b9");
  const violet = parseHexColor("#7f8cff");
  const cyan = parseHexColor("#22c7ee");
  const panel = parseHexColor("#141d33");
  const track = parseHexColor("#26324b");
  const green = parseHexColor("#72e5b8");

  canvas.drawText("D-SCOPE / PUBLIC RESEARCH REPORT", 66, 48, 4, violet, 48);
  canvas.drawText(snapshot.title, 66, 112, 7, white, 42);
  canvas.drawText(
    `${snapshot.finalParticipantCount} VERIFIED PARTICIPANTS`,
    68,
    222,
    4,
    green,
    36,
  );
  canvas.drawText(
    `PRIVACY: TOTAL ${snapshot.analytics.privacy.minTotalSample} / SEGMENT ${snapshot.analytics.privacy.minSegmentSample}`,
    68,
    260,
    3,
    muted,
    56,
  );

  const question = firstQuestion(snapshot);
  canvas.fillRect(62, 315, 1076, 270, panel);
  if (question) {
    canvas.drawText("TOP QUESTION", 90, 342, 3, violet, 22);
    canvas.drawText(question.title, 90, 380, 4, white, 48);
    const choices = question.choices.slice(0, 4);
    const max = Math.max(1, ...choices.map((choice) => choice.count));
    choices.forEach((choice, index) => {
      const y = 440 + index * 34;
      canvas.drawText(choice.label, 90, y, 3, muted, 24);
      canvas.fillRect(430, y + 3, 500, 16, track);
      canvas.fillRect(
        430,
        y + 3,
        Math.max(12, Math.round((choice.count / max) * 500)),
        16,
        index % 2 === 0 ? violet : cyan,
      );
      canvas.drawText(`${choice.count} / ${choice.percentage}%`, 952, y, 3, white, 16);
    });
  } else {
    canvas.drawText("FINALIZED AGGREGATE RESULTS", 90, 380, 5, white, 40);
    canvas.drawText("VIEW THE PUBLIC REPORT FOR FULL ANALYTICS", 90, 460, 4, muted, 52);
  }

  canvas.drawText(
    "VERIFY THE AUDIENCE. PROTECT THE RESPONDENT. REVEAL THE INSIGHT.",
    66,
    628,
    3,
    muted,
    76,
  );
  return encodePng(canvas);
}

function notFoundPage(): Response {
  return htmlResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report unavailable · D-Scope</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080b15;color:#f2f5ff;font-family:system-ui}.card{max-width:620px;margin:20px;padding:32px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(255,255,255,.04)}p{color:#97a2ba;line-height:1.6}a{color:#9eabff}</style></head><body><div class="card"><h1>Report unavailable</h1><p>This report does not exist or its creator has removed it from public access.</p><a href="/mvp/mvp.html">Open D-Scope</a></div></body></html>`,
    404,
  );
}

export async function handlePublicReportRoutes(
  request: Request,
  env: PublicReportRoutesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const parts = getPathParts(url);

  if (
    parts.length === 5 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "public-report" &&
    request.method === "POST"
  ) {
    if (parts[4] === "publish") {
      return publishReport(request, env, decodeURIComponent(parts[2]));
    }
    if (parts[4] === "unpublish") {
      return unpublishReport(request, env, decodeURIComponent(parts[2]));
    }
  }

  if (
    request.method === "GET" &&
    parts.length >= 2 &&
    parts[0] === "reports"
  ) {
    const slug = decodeURIComponent(parts[1]);
    const published = await getPublishedReport(env.dscope_db, slug);
    if (!published) return notFoundPage();
    const snapshot = published.snapshot;

    if (parts.length === 2) {
      return htmlResponse(renderPublicReportHtml(snapshot, request));
    }

    if (parts.length === 3 && parts[2] === "share.png") {
      const png = base64ToBytes(published.shareImageBase64);
      return new Response(png, {
        headers: {
          "content-type": "image/png",
          "content-disposition": `inline; filename="dscope-${snapshot.slug}.png"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
  }

  return null;
}
