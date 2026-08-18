import { useEffect, useMemo, useState } from "react";
import {
  confirmCreatorPasswordReset,
  getCreatorStatus,
  getMyCreatorWorkspace,
  loginCreator,
  publishMvpPublicReport,
  registerCreator,
  requestCreatorPasswordReset,
  requestMvpFinalize,
  setCreatorPassword,
  unpublishMvpPublicReport,
  updateCreatorProfile,
  verifyCreatorEmail,
} from "../api";
import type { CreatorProfile, Screen, Survey } from "../model";
import {
  canParticipateInSurvey,
  canRequestSurveyFinalization,
  canViewSurveyResults,
  effectiveSurveyStatus,
  formatTimeRemaining,
  surveyFromSummary,
  surveyStatusLabel,
} from "../model";
import type { CreatorStatusResponse, CreatorWorkspaceResponse } from "../types";
import { Badge, Metric } from "../components/Primitives";

type BadgeTone = "neutral" | "green" | "amber" | "blue" | "red";

function statusTone(status: string | null | undefined): BadgeTone {
  if (status === "approved" || status === "active") return "green";
  if (status === "finalized") return "blue";
  if (status === "ended") return "amber";
  if (
    status === "pending" ||
    status === "pending_email_verification" ||
    status === "password_required" ||
    status === "approved_password_required" ||
    status === "pending_approval" ||
    status === "draft" ||
    status === "deploying" ||
    status === "created" ||
    status === "finalizing"
  )
    return "amber";
  if (
    status === "failed" ||
    status === "finalization_failed" ||
    status === "rejected" ||
    status === "cancelled"
  )
    return "red";
  return "neutral";
}

function creatorFromStatus(next: CreatorStatusResponse): CreatorProfile | null {
  if (next.workspace) {
    return {
      organization: next.workspace.organizationName,
      email: next.workspace.contactEmail,
      website: next.workspace.website,
      status: "approved",
      workspaceId: next.workspace.id,
    };
  }

  if (next.application) {
    return {
      organization: next.application.organizationName,
      email: next.application.contactEmail,
      website: next.application.website,
      status: next.application.status,
      workspaceId: next.application.workspaceId,
    };
  }

  return null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function creatorFromAuth(next: {
  account: {
    email: string;
    status: string;
    profile: null | {
      organizationName: string;
      website: string | null;
      logoUrl: string | null;
    };
  };
  workspace?: null | {
    id: string;
    organizationName: string;
    website: string | null;
    logoUrl?: string | null;
  };
  application?: null | {
    organizationName: string;
    status: string;
    workspaceId: string | null;
    website: string | null;
    logoUrl?: string | null;
  };
}): CreatorProfile {
  return {
    organization:
      next.workspace?.organizationName ??
      next.account.profile?.organizationName ??
      next.application?.organizationName ??
      next.account.email,
    email: next.account.email,
    website:
      next.workspace?.website ??
      next.account.profile?.website ??
      next.application?.website ??
      null,
    logoUrl:
      next.workspace?.logoUrl ??
      next.account.profile?.logoUrl ??
      next.application?.logoUrl ??
      null,
    status: next.workspace
      ? "approved"
      : ((next.application?.status ??
          next.account.status) as CreatorProfile["status"]),
    workspaceId: next.workspace?.id ?? next.application?.workspaceId ?? null,
  };
}

function verificationTokenFromCurrentUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("creatorVerify") ?? "";
}

function setupTokenFromCurrentUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("creatorSetup") ?? "";
}

function resetTokenFromCurrentUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("creatorReset") ?? "";
}

export function CreatorAccessPage({
  creator,
  setCreator,
  setScreen,
  setMessage,
}: {
  creator: CreatorProfile | null;
  setCreator: (creator: CreatorProfile | null) => void;
  setScreen: (screen: Screen) => void;
  setMessage: (message: string | null) => void;
}) {
  const [mode, setMode] = useState<
    | "login"
    | "register"
    | "pending"
    | "verify"
    | "password"
    | "resetRequest"
    | "resetConfirm"
  >(
    resetTokenFromCurrentUrl()
      ? "resetConfirm"
      : setupTokenFromCurrentUrl()
      ? "password"
      : verificationTokenFromCurrentUrl()
        ? "verify"
        : "login",
  );
  const [organization, setOrganization] = useState(creator?.organization ?? "");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState(creator?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [website, setWebsite] = useState(creator?.website ?? "");
  const [logoUrl, setLogoUrl] = useState(creator?.logoUrl ?? "");
  const [description, setDescription] = useState("");
  const [verificationToken, setVerificationToken] = useState(
    verificationTokenFromCurrentUrl(),
  );
  const [setupToken, setSetupToken] = useState(setupTokenFromCurrentUrl());
  const [resetToken] = useState(resetTokenFromCurrentUrl());
  const [devVerificationUrl, setDevVerificationUrl] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<string>(
    creator?.status ?? "not signed in",
  );
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const nextEmail = normalizeEmail(email);
    if (!nextEmail || !password) {
      setMessage("Enter your creator email and password.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const next = await loginCreator({ email: nextEmail, password });
      const nextCreator = creatorFromAuth(next);
      setCreator(nextCreator);
      setStatus(nextCreator.status);
      setMessage(
        next.workspace
          ? "Creator Studio session restored."
          : "Creator account loaded. Workspace access is still pending approval.",
      );
      if (next.workspace) setScreen("creatorWorkspace");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    const nextEmail = normalizeEmail(email);
    if (!organization.trim() || !nextEmail) {
      setMessage("Organization and valid email are required.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await registerCreator({
        organizationName: organization,
        contactName,
        contactEmail: nextEmail,
        website,
        description,
        logoUrl,
      });
      setStatus(response.status);
      setDevVerificationUrl(response.devVerificationUrl ?? null);
      setMode("pending");
      setMessage(
        "Creator application submitted. D-Scope will review it manually. If approved, you will receive a password setup link by email.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create creator account.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmail() {
    if (!verificationToken.trim()) {
      setMessage(
        "Paste the email verification token or open the verification link.",
      );
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await verifyCreatorEmail(verificationToken.trim());
      setSetupToken(response.setupToken);
      setMode("password");
      setStatus("password_required");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("creatorVerify");
        window.history.replaceState({}, "", url.toString());
      }
      setMessage("Email verified. Create a strong password to finish setup.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not verify email.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    if (password !== passwordAgain) {
      setMessage("Passwords do not match.");
      return;
    }
    if (!setupToken) {
      setMessage(
        "Password setup token is missing. Open the approval email link again.",
      );
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const next = await setCreatorPassword({ setupToken, password });
      const nextCreator = creatorFromAuth(next);
      setCreator(nextCreator);
      setStatus(nextCreator.status);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("creatorSetup");
        url.searchParams.delete("creatorVerify");
        window.history.replaceState({}, "", url.toString());
      }
      setMessage(
        next.workspace
          ? "Creator account ready. Opening Creator Studio."
          : "Creator password saved. Workspace access is still pending approval.",
      );
      if (next.workspace) setScreen("creatorWorkspace");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not set creator password.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestPasswordReset() {
    const nextEmail = normalizeEmail(email);
    if (!nextEmail) {
      setMessage("Enter your creator email.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await requestCreatorPasswordReset(nextEmail);
      setMessage(response.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not request a password reset.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPasswordReset() {
    if (!resetToken) {
      setMessage("Password reset token is missing. Open the email link again.");
      return;
    }
    if (password !== passwordAgain) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const next = await confirmCreatorPasswordReset({ resetToken, password });
      const nextCreator = creatorFromAuth(next);
      setCreator(nextCreator);
      setStatus(nextCreator.status);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("creatorReset");
        window.history.replaceState({}, "", url.toString());
      }
      setMessage("Password reset complete. Previous Creator Studio sessions were revoked.");
      if (next.workspace) setScreen("creatorWorkspace");
      else setMode("login");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not reset password.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkLegacyStatus() {
    const nextEmail = normalizeEmail(email);
    if (!nextEmail) {
      setMessage("Enter an email to check creator status.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const next = await getCreatorStatus(nextEmail);
      setStatus(next.status);
      if (next.workspace) {
        setMessage(
          "This email has an approved workspace. Sign in or create a password if this account was not hardened yet.",
        );
      } else if (next.application) {
        setMessage(`Creator application is ${next.application.status}.`);
      } else {
        setMessage("No creator account/application found for this email.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not check status.",
      );
    } finally {
      setLoading(false);
    }
  }

  const currentStatus = status || creator?.status || "not signed in";

  return (
    <section className="creator-studio-grid">
      <div className="card main-panel creator-copy creator-studio-hero">
        <div className="page-title compact">
          <span>Creator Studio</span>
          <h1>Real creator accounts for verified research campaigns.</h1>
          <p>
            Submit a creator application, wait for manual approval, then create
            your password from the approval email and manage your workspace.
          </p>
        </div>

        <div className="creator-status-strip">
          <Badge tone={statusTone(currentStatus)}>{currentStatus}</Badge>
          <span>
            {creator?.workspaceId
              ? `Workspace ${creator.workspaceId}`
              : "Create a creator account or sign in to an existing workspace."}
          </span>
        </div>

        <div className="info-grid two">
          <div>
            <strong>Manual review</strong>
            <span>
              Creator access starts with a submitted application reviewed by
              D-Scope.
            </span>
          </div>
          <div>
            <strong>Approval email</strong>
            <span>
              After approval, D-Scope sends a link to create your password.
            </span>
          </div>
          <div>
            <strong>Workspace ownership</strong>
            <span>Surveys are scoped to the logged-in creator workspace.</span>
          </div>
          <div>
            <strong>Public identity</strong>
            <span>Organization, website and logo URL appear on surveys.</span>
          </div>
        </div>
      </div>

      <div className="card main-panel form-card creator-session-card">
        <div className="form-head">
          <div>
            <div className="eyebrow">Creator account</div>
            <h2>
              {mode === "login" && "Sign in"}
              {mode === "register" && "Create account"}
              {mode === "pending" && "Application submitted"}
              {mode === "verify" && "Verify email"}
              {mode === "password" && "Create password"}
              {mode === "resetRequest" && "Reset password"}
              {mode === "resetConfirm" && "Choose a new password"}
            </h2>
            <p className="muted">
              {mode === "login" &&
                "Use your verified creator email and password."}
              {mode === "register" &&
                "Request access to publish verified surveys on D-Scope."}
              {mode === "pending" &&
                "Your application is waiting for manual review."}
              {mode === "verify" &&
                "Open the legacy verification link or paste the token."}
              {mode === "password" &&
                "Use a strong password to protect your Creator Studio."}
              {mode === "resetRequest" &&
                "We will email a short-lived reset link if the account is eligible."}
              {mode === "resetConfirm" &&
                "The reset link is single-use and expires after 30 minutes."}
            </p>
          </div>
          <Badge tone={statusTone(currentStatus)}>{currentStatus}</Badge>
        </div>

        {mode === "login" && (
          <>
            <label>
              <span>Creator email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="founder@project.xyz"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your creator password"
              />
            </label>
            <div className="action-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => void handleLogin()}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("register")}
              >
                Create account
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={loading}
                onClick={() => void checkLegacyStatus()}
              >
                Check status
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("resetRequest")}
              >
                Forgot password
              </button>
            </div>
          </>
        )}

        {mode === "resetRequest" && (
          <>
            <label>
              <span>Creator email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="founder@project.xyz"
              />
            </label>
            <div className="action-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => void handleRequestPasswordReset()}
              >
                {loading ? "Requesting..." : "Email reset link"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("login")}
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        {mode === "register" && (
          <>
            <label>
              <span>Organization / project</span>
              <input
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
              />
            </label>
            <label>
              <span>Contact name</span>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>Website</span>
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://project.xyz"
              />
            </label>
            <label>
              <span>Logo URL</span>
              <input
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://project.xyz/logo.png"
              />
            </label>
            <label>
              <span>Short description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="action-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => void handleRegister()}
              >
                {loading ? "Submitting..." : "Submit application"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("login")}
              >
                I already have an account
              </button>
            </div>
          </>
        )}

        {mode === "pending" && (
          <>
            <div className="notice-card">
              <strong>Application submitted</strong>
              <span>
                Your creator application is now pending manual review. If
                approved, D-Scope will send a password setup link to your email.
                Until then, public survey publishing remains locked.
              </span>
            </div>
            <div className="action-row">
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("login")}
              >
                Back to sign in
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={loading}
                onClick={() => void checkLegacyStatus()}
              >
                Check status
              </button>
            </div>
          </>
        )}

        {mode === "verify" && (
          <>
            {devVerificationUrl && (
              <div className="warning-box">
                <strong>Legacy dev verification link</strong>
                <span>{devVerificationUrl}</span>
              </div>
            )}
            <label>
              <span>Legacy verification token</span>
              <input
                value={verificationToken}
                onChange={(event) => setVerificationToken(event.target.value)}
              />
            </label>
            <div className="action-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => void handleVerifyEmail()}
              >
                {loading ? "Verifying..." : "Verify legacy email link"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("login")}
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        {mode === "password" && (
          <>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              <span>Repeat password</span>
              <input
                type="password"
                value={passwordAgain}
                onChange={(event) => setPasswordAgain(event.target.value)}
              />
            </label>
            <p className="muted small-note">
              Minimum 10 characters with lowercase, uppercase, number and
              symbol.
            </p>
            <div className="action-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => void handleSetPassword()}
              >
                {loading ? "Saving..." : "Create password"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("login")}
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        {mode === "resetConfirm" && (
          <>
            <label>
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              <span>Repeat new password</span>
              <input
                type="password"
                value={passwordAgain}
                onChange={(event) => setPasswordAgain(event.target.value)}
              />
            </label>
            <p className="muted small-note">
              Minimum 10 characters with lowercase, uppercase, number and
              symbol.
            </p>
            <div className="action-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => void handleConfirmPasswordReset()}
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => setMode("login")}
              >
                Back to sign in
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function CreatorWorkspace({
  creator,
  surveys,
  setScreen,
  onOpenSurvey,
  onRefresh,
  onSignOut,
  setMessage,
}: {
  creator: CreatorProfile | null;
  surveys: Survey[];
  setScreen: (screen: Screen) => void;
  onOpenSurvey: (survey: Survey) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  setMessage: (message: string | null) => void;
}) {
  const [workspace, setWorkspace] = useState<CreatorWorkspaceResponse | null>(
    null,
  );
  const [workspaceId, setWorkspaceId] = useState(creator?.workspaceId ?? "");
  const [loading, setLoading] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    organizationName: creator?.organization ?? "",
    contactName: "",
    website: creator?.website ?? "",
    description: "",
    logoUrl: creator?.logoUrl ?? "",
  });

  async function loadWorkspace(options?: { silent?: boolean }) {
    setLoading(true);
    if (!options?.silent) setMessage(null);
    try {
      const next = await getMyCreatorWorkspace();
      setWorkspace(next);
      setWorkspaceId(next.workspace?.id ?? "");
      if (!next.workspace) {
        if (!options?.silent) {
          setMessage(
            "Creator account loaded, but workspace access is still pending approval.",
          );
        }
        return;
      }
      if (!options?.silent) setMessage("Creator workspace refreshed.");
    } catch (error) {
      if (!options?.silent) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load creator workspace.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestFinalizationForSurvey(survey: Survey) {
    const isRetry = effectiveSurveyStatus(survey) === "finalization_failed";

    if (!canRequestSurveyFinalization(survey)) {
      setMessage(
        "Finalization is automatic after the survey end time. Manual action is only needed if finalization fails.",
      );
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await requestMvpFinalize({ surveyId: survey.id });
      setMessage(
        isRetry
          ? "Finalization retry requested. D-Scope runner is preparing aggregate results again."
          : "Finalization requested. D-Scope runner is preparing aggregate results.",
      );
      await loadWorkspace({ silent: true });
      onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not request survey finalization.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function publishReportForSurvey(survey: Survey) {
    if (!canViewSurveyResults(survey)) {
      setMessage("A public report can be published only after finalization.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await publishMvpPublicReport(survey.id);
      setMessage(
        `Public report published: ${new URL(
          response.publicReport.url,
          window.location.origin,
        ).toString()}`,
      );
      await loadWorkspace({ silent: true });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not publish the public report.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function unpublishReportForSurvey(survey: Survey) {
    setLoading(true);
    setMessage(null);
    try {
      await unpublishMvpPublicReport(survey.id);
      setMessage(
        "Public report unpublished. Its page and share image are no longer available.",
      );
      await loadWorkspace({ silent: true });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not unpublish the public report.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyPublicReportLink(survey: Survey) {
    if (!survey.publicReport.url) return;
    const publicUrl = new URL(
      survey.publicReport.url,
      window.location.origin,
    ).toString();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage("Public report link copied.");
    } catch {
      setMessage(publicUrl);
    }
  }

  function downloadPublicShareImage(survey: Survey) {
    if (!survey.publicReport.shareImageUrl) return;
    const imageUrl = new URL(
      survey.publicReport.shareImageUrl,
      window.location.origin,
    ).toString();
    window.open(imageUrl, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    if (creator?.workspaceId && !workspace) {
      void loadWorkspace({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creator?.workspaceId]);

  useEffect(() => {
    const current = workspace?.workspace;
    setProfileDraft({
      organizationName:
        current?.organizationName ?? creator?.organization ?? "",
      contactName: current?.contactName ?? "",
      website: current?.website ?? creator?.website ?? "",
      description: current?.description ?? "",
      logoUrl: current?.logoUrl ?? creator?.logoUrl ?? "",
    });
  }, [creator, workspace]);

  async function saveProfile() {
    setLoading(true);
    setMessage(null);
    try {
      await updateCreatorProfile(profileDraft);
      setMessage("Creator profile updated.");
      await loadWorkspace({ silent: true });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update creator profile.",
      );
    } finally {
      setLoading(false);
    }
  }

  const creatorSurveys = useMemo(() => {
    if (workspace?.surveys?.length) {
      return workspace.surveys.map(surveyFromSummary);
    }

    return [];
  }, [workspace]);

  const activeCount = creatorSurveys.filter((survey) =>
    canParticipateInSurvey(survey),
  ).length;
  const finalizedCount = creatorSurveys.filter(
    (survey) => effectiveSurveyStatus(survey) === "finalized",
  ).length;
  const totalParticipants = creatorSurveys.reduce(
    (sum, survey) => sum + Number(survey.participants || 0),
    0,
  );

  if (!workspace?.workspace) {
    return (
      <section className="screen-stack">
        <div className="card workspace-empty">
          <div>
            <div className="eyebrow">Creator Studio</div>
            <h1>No active workspace loaded</h1>
            <p>
              Sign in with an approved creator account. If your application is
              still pending, you can view this state but cannot create surveys
              yet.
            </p>
          </div>
          <div className="action-row">
            <button
              className="primary-btn"
              type="button"
              onClick={() => setScreen("creatorAccess")}
            >
              Open Creator Studio
            </button>
            <button className="secondary-btn" type="button" onClick={onRefresh}>
              Refresh public surveys
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack">
      <div className="workspace-hero card workspace-header-card">
        <div>
          <div className="eyebrow">Creator Studio</div>
          <h1>
            {workspace?.workspace?.organizationName ??
              creator?.organization ??
              "Creator workspace"}
          </h1>
          <p>
            Your persistent workspace for creating surveys, tracking deployment
            status and reviewing results.
          </p>
        </div>
        <div className="action-row workspace-actions">
          <button
            className="primary-btn"
            type="button"
            onClick={() => setScreen("builder")}
          >
            Create survey
          </button>
          <button
            className="secondary-btn"
            type="button"
            disabled={loading}
            onClick={() => void loadWorkspace()}
          >
            {loading ? "Refreshing..." : "Refresh workspace"}
          </button>
          <button className="ghost-btn" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="metric-grid four creator-quick-stats">
        <Metric label="Surveys" value={creatorSurveys.length} />
        <Metric label="Active" value={activeCount} />
        <Metric label="Finalized" value={finalizedCount} />
        <Metric label="Participants" value={totalParticipants} />
      </div>

      <div className="card panel workspace-profile-card">
        <div className="form-head">
          <div>
            <h2>Workspace profile</h2>
            <p className="muted">
              This is the creator identity attached to new surveys from the
              public MVP builder.
            </p>
          </div>
          <Badge
            tone={statusTone(workspace?.workspace?.status ?? creator?.status)}
          >
            {workspace?.workspace?.status ?? creator?.status ?? "unknown"}
          </Badge>
        </div>
        <div className="creator-profile-editor">
          <label>
            <span>Organization</span>
            <input
              value={profileDraft.organizationName}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  organizationName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Website</span>
            <input
              value={profileDraft.website}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  website: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Logo URL</span>
            <input
              value={profileDraft.logoUrl}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  logoUrl: event.target.value,
                }))
              }
              placeholder="https://project.xyz/logo.png"
            />
          </label>
          <label>
            <span>Public description</span>
            <textarea
              value={profileDraft.description}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <div className="action-row">
            <button
              className="primary-btn"
              type="button"
              disabled={loading}
              onClick={() => void saveProfile()}
            >
              Save profile
            </button>
            <span className="muted small-note">
              Email is locked for v1:{" "}
              {workspace?.workspace?.contactEmail ?? creator?.email ?? "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="card panel">
        <div className="form-head">
          <div>
            <h2>Surveys</h2>
            <p className="muted">
              Draft, failed and active surveys stay visible here so creator
              operations are never hidden.
            </p>
          </div>
          <button className="secondary-btn" type="button" onClick={onRefresh}>
            Refresh public list
          </button>
        </div>
        <div className="creator-survey-list public-creator-survey-list">
          {creatorSurveys.map((survey) => (
            <article className="creator-survey-row" key={survey.id}>
              <div>
                <strong>{survey.title}</strong>
                <span>{survey.description}</span>
                {canViewSurveyResults(survey) ? (
                  <span className="creator-public-report-state">
                    Public report:{" "}
                    {survey.publicReport.status === "published"
                      ? "published"
                      : "not published"}
                  </span>
                ) : null}
              </div>
              <Badge tone={statusTone(effectiveSurveyStatus(survey))}>
                {surveyStatusLabel(survey, { creator: true })}
              </Badge>
              <span>{survey.participants} participants</span>
              <span>
                {canParticipateInSurvey(survey)
                  ? `${formatTimeRemaining(survey.schedule?.timeRemainingSeconds)} left`
                  : surveyStatusLabel(survey, { creator: true })}
              </span>
              <div className="creator-row-actions">
                {canViewSurveyResults(survey) ? (
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => onOpenSurvey(survey)}
                  >
                    View results
                  </button>
                ) : effectiveSurveyStatus(survey) === "finalization_failed" ? (
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={loading}
                    onClick={() => void requestFinalizationForSurvey(survey)}
                  >
                    Retry finalization
                  </button>
                ) : effectiveSurveyStatus(survey) === "ended" ? (
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled
                    title="D-Scope runner will automatically start finalization after the survey end time."
                  >
                    Queued for finalization
                  </button>
                ) : effectiveSurveyStatus(survey) === "finalizing" ? (
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled
                    title="Aggregate results are being prepared by D-Scope runner."
                  >
                    Preparing results
                  </button>
                ) : (
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => onOpenSurvey(survey)}
                  >
                    View status
                  </button>
                )}
                {canViewSurveyResults(survey) &&
                survey.publicReport.status === "published" ? (
                  <>
                    <button
                      className="secondary-btn"
                      type="button"
                      disabled={loading}
                      onClick={() => void copyPublicReportLink(survey)}
                    >
                      Copy public link
                    </button>
                    <button
                      className="secondary-btn"
                      type="button"
                      disabled={loading}
                      onClick={() => downloadPublicShareImage(survey)}
                    >
                      Share PNG
                    </button>
                    <button
                      className="ghost-btn"
                      type="button"
                      disabled={loading}
                      onClick={() => void unpublishReportForSurvey(survey)}
                    >
                      Unpublish
                    </button>
                  </>
                ) : canViewSurveyResults(survey) ? (
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={loading}
                    onClick={() => void publishReportForSurvey(survey)}
                  >
                    Publish report
                  </button>
                ) : null}
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() =>
                    setMessage(
                      canViewSurveyResults(survey)
                        ? "Finalized aggregate results are available with privacy thresholds applied."
                        : effectiveSurveyStatus(survey) ===
                            "finalization_failed"
                          ? "Finalization failed. You can retry finalization; interim analytics remain locked."
                          : effectiveSurveyStatus(survey) === "finalizing"
                            ? "Results are being prepared. D-Scope does not expose interim analytics before finalization."
                            : effectiveSurveyStatus(survey) === "ended"
                              ? "This survey has ended. D-Scope runner will automatically start finalization; no creator action is required."
                              : "Results remain locked until the survey is finalized.",
                    )
                  }
                >
                  More
                </button>
              </div>
            </article>
          ))}
          {!creatorSurveys.length && (
            <div className="workspace-empty compact">
              <strong>No surveys yet</strong>
              <span>
                Create your first verified survey from this workspace.
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
