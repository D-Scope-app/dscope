import type {
  CreateMvpSurveyBody,
  CreateMvpSurveyResponse,
  CreatorApplication,
  CreatorApplyResponse,
  CreatorAuthResponse,
  CreatorWorkspace,
  CreatorRegisterResponse,
  CreatorStatusResponse,
  CreatorVerifyEmailResponse,
  CreatorWorkspaceResponse,
  CompleteVerificationSessionResponse,
  InternalCreatorApplicationsResponse,
  InternalRunnerJobsResponse,
  MvpSurveyDetail,
  MvpSurveySummary,
  ParticipantActivityResponse,
  ParticipantViewResponse,
} from "./types";

const API_BASE = (import.meta.env.VITE_D_SCOPE_API_BASE_URL ?? "")
  .toString()
  .replace(/\/+$/, "");

const ADMIN_TOKEN_STORAGE_KEY = "dscope_admin_token";

export function getStoredAdminToken() {
  return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
}

export function storeAdminToken(token: string) {
  const normalized = token.trim();
  if (!normalized) {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, normalized);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (init?.body && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.error?.message || data?.error?.code || response.statusText;
    throw new Error(message);
  }

  return data as T;
}

function adminHeaders(token?: string) {
  return {
    authorization: `Bearer ${(token ?? getStoredAdminToken()).trim()}`,
  };
}

export async function listMvpSurveys(status = "all") {
  return requestJson<{ ok: true; surveys: MvpSurveySummary[] }>(
    `/mvp/surveys?status=${encodeURIComponent(status)}`,
  );
}

export async function getMvpSurvey(surveyId: string) {
  return requestJson<MvpSurveyDetail>(
    `/mvp/surveys/${encodeURIComponent(surveyId)}`,
  );
}

export async function createMvpSurvey(body: CreateMvpSurveyBody) {
  return requestJson<CreateMvpSurveyResponse>("/mvp/surveys", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function registerCreator(input: {
  organizationName: string;
  contactEmail: string;
  contactName?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
}) {
  return requestJson<CreatorRegisterResponse>("/mvp/creators/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyCreatorEmail(token: string) {
  return requestJson<CreatorVerifyEmailResponse>("/mvp/creators/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function setCreatorPassword(input: {
  setupToken: string;
  password: string;
}) {
  return requestJson<CreatorAuthResponse>("/mvp/creators/set-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestCreatorPasswordReset(email: string) {
  return requestJson<{ ok: true; message: string }>(
    "/mvp/creators/request-password-reset",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export async function confirmCreatorPasswordReset(input: {
  resetToken: string;
  password: string;
}) {
  return requestJson<CreatorAuthResponse>(
    "/mvp/creators/confirm-password-reset",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function loginCreator(input: { email: string; password: string }) {
  return requestJson<CreatorAuthResponse>("/mvp/creators/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function logoutCreator() {
  return requestJson<{ ok: true }>("/mvp/creators/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getCreatorMe() {
  return requestJson<CreatorAuthResponse>("/mvp/creators/me");
}

export async function updateCreatorProfile(input: {
  organizationName?: string;
  contactName?: string | null;
  website?: string | null;
  description?: string | null;
  logoUrl?: string | null;
}) {
  return requestJson<CreatorAuthResponse>("/mvp/creators/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function applyCreator(input: {
  organizationName: string;
  contactEmail: string;
  contactName?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  requestedWalletAddress?: string;
}) {
  return requestJson<CreatorApplyResponse>("/mvp/creators/apply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCreatorStatus(email: string) {
  return requestJson<CreatorStatusResponse>(
    `/mvp/creators/status?email=${encodeURIComponent(email)}`,
  );
}

export async function getCreatorWorkspace(workspaceId: string) {
  // Legacy compatibility only. The public product should use getMyCreatorWorkspace(),
  // which is scoped by the HttpOnly creator session cookie.
  return requestJson<CreatorWorkspaceResponse>(
    `/mvp/creators/${encodeURIComponent(workspaceId)}/workspace`,
  );
}

export async function getMyCreatorWorkspace() {
  return requestJson<CreatorWorkspaceResponse>("/mvp/creators/me/workspace");
}

export async function getParticipantActivity(participantRef: string) {
  return requestJson<ParticipantActivityResponse>(
    `/mvp/participants/${encodeURIComponent(participantRef)}/activity`,
  );
}

export async function listAdminCreatorApplications(input?: {
  status?: string;
  token?: string;
}) {
  const status = input?.status ?? "pending";
  return requestJson<InternalCreatorApplicationsResponse>(
    `/internal/mvp/creator-applications?status=${encodeURIComponent(status)}`,
    { headers: adminHeaders(input?.token) },
  );
}

export async function approveCreatorApplication(input: {
  applicationId: string;
  reviewNote?: string;
  token?: string;
}) {
  return requestJson<{
    ok: true;
    application: CreatorApplication | null;
    workspace: CreatorWorkspace | null;
    passwordSetupEmailSent?: boolean;
    devPasswordSetupUrl?: string | null;
  }>(
    `/internal/mvp/creator-applications/${encodeURIComponent(input.applicationId)}/approve`,
    {
      method: "POST",
      headers: adminHeaders(input.token),
      body: JSON.stringify({
        reviewNote: input.reviewNote ?? "Approved from MVP admin",
      }),
    },
  );
}

export async function rejectCreatorApplication(input: {
  applicationId: string;
  reviewNote?: string;
  token?: string;
}) {
  return requestJson<unknown>(
    `/internal/mvp/creator-applications/${encodeURIComponent(input.applicationId)}/reject`,
    {
      method: "POST",
      headers: adminHeaders(input.token),
      body: JSON.stringify({
        reviewNote: input.reviewNote ?? "Rejected from MVP admin",
      }),
    },
  );
}

export async function listAdminRunnerJobs(input?: {
  status?: string;
  type?: string;
  token?: string;
}) {
  const status = input?.status ?? "all";
  const type = input?.type ?? "all";
  return requestJson<InternalRunnerJobsResponse>(
    `/internal/mvp/runner/jobs?status=${encodeURIComponent(status)}&type=${encodeURIComponent(type)}`,
    { headers: adminHeaders(input?.token) },
  );
}

export async function retryRunnerJob(input: { jobId: string; token?: string }) {
  return requestJson<unknown>(
    `/internal/mvp/runner/jobs/${encodeURIComponent(input.jobId)}/retry`,
    {
      method: "POST",
      headers: adminHeaders(input.token),
      body: JSON.stringify({}),
    },
  );
}

export async function createVerificationSession(input: {
  surveyId: string;
  walletAddress: string;
}) {
  return requestJson<{
    ok: boolean;
    verificationSession: {
      id: string;
      status: string;
      expiresAt: string;
    };
    clientToken: string;
    verifierUrl: string;
    request: {
      domain: string;
      scope: string;
      binding: string;
      validitySeconds: number;
      queryHash: string;
    };
  }>(`/surveys/${encodeURIComponent(input.surveyId)}/verification-sessions`, {
    method: "POST",
    body: JSON.stringify({ walletAddress: input.walletAddress }),
  });
}

export async function submitZkPassportProofs(input: {
  verifierUrl: string;
  sessionId: string;
  clientToken: string;
  proofs: unknown;
  originalQuery: unknown;
  queryResult: unknown;
  providerPayloadVersion?: string | null;
}) {
  const response = await fetch(`${input.verifierUrl.replace(/\/+$/, "")}/verify`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      clientToken: input.clientToken,
      proofs: input.proofs,
      originalQuery: input.originalQuery,
      queryResult: input.queryResult,
      providerPayloadVersion: input.providerPayloadVersion ?? null,
    }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error?.message || data?.error?.code || data?.error || response.statusText,
    );
  }
  return data as { ok: true; status: "queued" | "verifying" };
}

export async function getVerificationSessionStatus(input: {
  sessionId: string;
  clientToken: string;
}) {
  return requestJson<CompleteVerificationSessionResponse>(
    `/verification-sessions/${encodeURIComponent(input.sessionId)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: { "x-verification-token": input.clientToken },
    },
  );
}

export async function submitMvpResponse(input: {
  surveyId: string;
  participantRef: string;
  answers: Record<string, string | string[]>;
  participationTxHash?: string;
}) {
  return requestJson<unknown>(
    `/mvp/surveys/${encodeURIComponent(input.surveyId)}/responses`,
    {
      method: "POST",
      body: JSON.stringify({
        participantRef: input.participantRef,
        answers: input.answers,
        participationTxHash: input.participationTxHash,
      }),
    },
  );
}

export async function publishMvpPublicReport(surveyId: string) {
  return requestJson<{
    ok: true;
    publicReport: {
      status: "published";
      slug: string;
      url: string;
      shareImageUrl: string;
      publishedAt: string | null;
    };
  }>(`/mvp/surveys/${encodeURIComponent(surveyId)}/public-report/publish`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function unpublishMvpPublicReport(surveyId: string) {
  return requestJson<{
    ok: true;
    publicReport: {
      status: "unpublished";
      slug: null;
      url: null;
      shareImageUrl: null;
      publishedAt: null;
    };
  }>(`/mvp/surveys/${encodeURIComponent(surveyId)}/public-report/unpublish`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function requestMvpFinalize(input: {
  surveyId: string;
  finalizedAt?: string;
  currentTime?: string;
}) {
  const now = Math.floor(Date.now() / 1000).toString();
  return requestJson<unknown>(
    `/mvp/surveys/${encodeURIComponent(input.surveyId)}/request-finalize`,
    {
      method: "POST",
      body: JSON.stringify({
        finalizedAt: input.finalizedAt ?? now,
        currentTime: input.currentTime ?? input.finalizedAt ?? now,
      }),
    },
  );
}

export async function getParticipantView(input: {
  surveyId: string;
  participantRef: string;
}) {
  return requestJson<ParticipantViewResponse>(
    `/mvp/surveys/${encodeURIComponent(input.surveyId)}/participant-view?participantRef=${encodeURIComponent(input.participantRef)}`,
  );
}
