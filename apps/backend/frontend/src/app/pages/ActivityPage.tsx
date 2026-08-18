import { useEffect, useState } from "react";
import { getParticipantActivity } from "../api";
import type { Screen, WalletConnection } from "../model";
import { LOCAL_PARTICIPANT_REF } from "../model";
import type { ParticipantActivityResponse } from "../types";
import { Badge, Metric } from "../components/Primitives";
import {
  PUBLIC_ENABLE_DEV_MODE,
  PUBLIC_SHOW_CONTRACT_DETAILS,
} from "../publicConfig";

export function ActivityPage({
  wallet,
  onUseLocalWallet,
  setScreen,
  setMessage,
}: {
  wallet: WalletConnection;
  onUseLocalWallet: () => void;
  setScreen: (screen: Screen) => void;
  setMessage: (message: string | null) => void;
}) {
  const [manualParticipantRef, setManualParticipantRef] = useState(
    LOCAL_PARTICIPANT_REF,
  );
  const [activity, setActivity] = useState<ParticipantActivityResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const activeParticipantRef = wallet.participantRef || manualParticipantRef;

  async function loadActivity(participantRef = activeParticipantRef) {
    if (!participantRef.trim()) {
      setMessage("Connect a wallet first to load activity.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const next = await getParticipantActivity(participantRef.trim());
      setActivity(next);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load participant activity.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (wallet.participantRef) {
      void loadActivity(wallet.participantRef);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.participantRef]);

  const rows = activity?.activity ?? [];

  return (
    <section className="screen-stack">
      <div className="section-head">
        <div>
          <div className="eyebrow">Participant</div>
          <h1>My Activity</h1>
          <p>
            Activity is scoped to the currently connected account. Connect a
            different account to view a separate participation history.
          </p>
        </div>
        <button
          className="secondary-btn"
          type="button"
          onClick={() => setScreen("explore")}
        >
          Explore surveys
        </button>
      </div>

      <div className="card panel wallet-panel">
        <div>
          <h2>
            {wallet.connected ? "Wallet connected" : "Wallet not connected"}
          </h2>
          <p className="muted">
            {wallet.connected
              ? `Using ${wallet.label}.`
              : "Connect Azguard to load your respondent history."}
          </p>
        </div>
        {wallet.connected ? (
          <button
            className="primary-btn"
            type="button"
            onClick={() => void loadActivity()}
          >
            Refresh activity
          </button>
        ) : (
          PUBLIC_ENABLE_DEV_MODE && (
            <button
              className="primary-btn"
              type="button"
              onClick={onUseLocalWallet}
            >
              Use local dev wallet
            </button>
          )
        )}
      </div>

      {PUBLIC_ENABLE_DEV_MODE && (
        <div className="card panel activity-loader dev-only-panel">
          <label>
            <span>Dev fallback participantRef</span>
            <input
              value={manualParticipantRef}
              onChange={(event) => setManualParticipantRef(event.target.value)}
              disabled={wallet.connected}
            />
          </label>
          <button
            className="secondary-btn"
            type="button"
            disabled={loading}
            onClick={() => void loadActivity()}
          >
            {loading ? "Loading..." : "Load activity"}
          </button>
        </div>
      )}

      <div className="metric-grid two">
        <Metric
          label="Completed"
          value={activity?.summary.completedSurveys ?? "—"}
        />
        <Metric
          label="Results available"
          value={rows.filter((row) => row.survey.status === "finalized").length}
        />
      </div>

      <div className="card panel">
        <div className="form-head">
          <h2>Recent activity</h2>
          <span className="muted">{rows.length} records</span>
        </div>
        <div className="activity-list">
          {rows.map((row) => (
            <div
              className="activity-row public-activity-row"
              key={`${row.survey.id}_${row.participation.participatedAt}`}
            >
              <div>
                <strong>{row.survey.title}</strong>
                <span>
                  {row.survey.status === "finalized"
                    ? "Results available"
                    : "Participation recorded"}
                </span>
              </div>
              <Badge
                tone={
                  row.survey.status === "finalized"
                    ? "blue"
                    : row.survey.status === "active"
                      ? "green"
                      : "neutral"
                }
              >
                {row.survey.status}
              </Badge>
              <span>{row.participation.status}</span>
              {PUBLIC_SHOW_CONTRACT_DETAILS && (
                <span>{row.participation.participationTxHash}</span>
              )}
            </div>
          ))}
          {!rows.length && <p className="muted">No activity loaded yet.</p>}
        </div>
      </div>
    </section>
  );
}
