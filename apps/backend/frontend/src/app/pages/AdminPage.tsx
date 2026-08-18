import { useEffect, useState } from "react";
import {
  approveCreatorApplication,
  getStoredAdminToken,
  listAdminCreatorApplications,
  listAdminRunnerJobs,
  rejectCreatorApplication,
  retryRunnerJob,
  storeAdminToken,
} from "../api";
import type { Screen } from "../model";
import { shortHash } from "../model";
import type { CreatorApplication, InternalRunnerJobsResponse } from "../types";
import { Badge, Metric } from "../components/Primitives";

export function AdminPage({
  setScreen,
  setMessage,
}: {
  setScreen: (screen: Screen) => void;
  setMessage: (message: string | null) => void;
}) {
  const [token, setToken] = useState(getStoredAdminToken());
  const [appStatus, setAppStatus] = useState("pending");
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [jobs, setJobs] = useState<InternalRunnerJobsResponse["jobs"]>([]);
  const [jobStatus, setJobStatus] = useState("failed");
  const [loading, setLoading] = useState(false);

  function saveToken() {
    storeAdminToken(token);
    setMessage("Admin token saved locally in browser storage.");
  }

  async function loadApplications() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await listAdminCreatorApplications({
        status: appStatus,
        token,
      });
      setApplications(response.applications);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load creator applications.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadJobs() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await listAdminRunnerJobs({ status: jobStatus, token });
      setJobs(response.jobs);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load runner jobs.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: string) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await approveCreatorApplication({
        applicationId: id,
        token,
        reviewNote: "Approved from MVP admin page",
      });
      await loadApplications();
      setMessage(
        response.passwordSetupEmailSent
          ? "Creator application approved. Password setup email sent."
          : `Creator application approved. Dev password setup link: ${response.devPasswordSetupUrl ?? "not available"}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not approve creator application.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function reject(id: string) {
    setLoading(true);
    setMessage(null);
    try {
      await rejectCreatorApplication({
        applicationId: id,
        token,
        reviewNote: "Rejected from MVP admin page",
      });
      await loadApplications();
      setMessage("Creator application rejected.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reject creator application.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function retry(id: string) {
    setLoading(true);
    setMessage(null);
    try {
      await retryRunnerJob({ jobId: id, token });
      await loadJobs();
      setMessage("Runner job moved back to pending.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not retry runner job.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApplications();
    void loadJobs();
  }, []);

  return (
    <section className="screen-stack">
      <div className="section-head">
        <div>
          <div className="eyebrow">Internal</div>
          <h1>Admin Control Room</h1>
          <p>
            Creator approvals and runner job recovery. MVP-only internal surface
            protected by bearer token.
          </p>
        </div>
        <button
          className="secondary-btn"
          type="button"
          onClick={() => setScreen("home")}
        >
          Back to app
        </button>
      </div>

      <div className="card panel admin-token-panel">
        <label>
          <span>Admin token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button className="secondary-btn" type="button" onClick={saveToken}>
          Save token
        </button>
      </div>

      <div className="metric-grid four">
        <Metric label="Applications" value={applications.length} />
        <Metric label="Runner jobs" value={jobs.length} />
        <Metric label="Loading" value={loading ? "yes" : "no"} />
        <Metric label="Mode" value="local MVP" />
      </div>

      <div className="two-column admin-columns">
        <div className="card panel">
          <div className="form-head">
            <div>
              <h2>Creator applications</h2>
              <p className="muted">
                Approve trusted organizations before they create public surveys.
              </p>
            </div>
            <div className="action-row">
              <select
                value={appStatus}
                onChange={(event) => setAppStatus(event.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
              <button
                className="secondary-btn"
                type="button"
                onClick={loadApplications}
              >
                Load
              </button>
            </div>
          </div>
          <div className="admin-list">
            {applications.map((app) => (
              <div className="admin-item" key={app.id}>
                <div>
                  <strong>{app.organizationName}</strong>
                  <span>{app.contactEmail}</span>
                  <span>{app.website ?? "no website"}</span>
                </div>
                <Badge
                  tone={
                    app.status === "approved"
                      ? "green"
                      : app.status === "pending"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {app.status}
                </Badge>
                <div className="action-row">
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={loading || app.status === "approved"}
                    onClick={() => void approve(app.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="ghost-btn"
                    type="button"
                    disabled={loading || app.status === "rejected"}
                    onClick={() => void reject(app.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!applications.length && (
              <p className="muted">No applications for selected filter.</p>
            )}
          </div>
        </div>

        <div className="card panel">
          <div className="form-head">
            <div>
              <h2>Runner jobs</h2>
              <p className="muted">
                Inspect failed/pending/done orchestration jobs.
              </p>
            </div>
            <div className="action-row">
              <select
                value={jobStatus}
                onChange={(event) => setJobStatus(event.target.value)}
              >
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="done">Done</option>
                <option value="all">All</option>
              </select>
              <button
                className="secondary-btn"
                type="button"
                onClick={loadJobs}
              >
                Load
              </button>
            </div>
          </div>
          <div className="admin-list">
            {jobs.map((job) => (
              <div className="admin-item" key={job.id}>
                <div>
                  <strong>{job.type}</strong>
                  <span>{shortHash(job.id)}</span>
                  <span>{job.surveyId ?? "no survey"}</span>
                  {job.lastError && <em>{job.lastError}</em>}
                </div>
                <Badge
                  tone={
                    job.status === "done"
                      ? "green"
                      : job.status === "failed"
                        ? "red"
                        : job.status === "pending"
                          ? "amber"
                          : "neutral"
                  }
                >
                  {job.status}
                </Badge>
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={loading || job.status !== "failed"}
                  onClick={() => void retry(job.id)}
                >
                  Retry
                </button>
              </div>
            ))}
            {!jobs.length && (
              <p className="muted">No jobs for selected filter.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
