import { Component, type ReactNode, useEffect, useState } from "react";
import {
  getCreatorMe,
  getMvpSurvey,
  listMvpSurveys,
  logoutCreator,
} from "./api";
import type { ParticipantViewResponse } from "./types";
import { Header } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { ExplorePage } from "./pages/ExplorePage";
import { SurveyPage } from "./pages/SurveyPage";
import { SurveyBuilder } from "./pages/SurveyBuilderPage";
import { ResultsPage } from "./pages/ResultsPage";
import { CreatorAccessPage, CreatorWorkspace } from "./pages/CreatorPages";
import { ActivityPage } from "./pages/ActivityPage";
import { AdminPage } from "./pages/AdminPage";
import type { CreatorProfile, Screen, Survey, WalletConnection } from "./model";
import {
  EMPTY_WALLET_CONNECTION,
  LOCAL_DEV_WALLET_CONNECTION,
  canViewSurveyResults,
  surveyFromDetail,
  surveyFromSummary,
} from "./model";
import { connectAzguardWallet } from "./wallet/azguard";
import { PUBLIC_ENABLE_ADMIN, PUBLIC_ENABLE_DEV_MODE } from "./publicConfig";

type ScreenErrorBoundaryProps = {
  screen: Screen;
  onBackHome: () => void;
  onResetCreator: () => void;
  children: ReactNode;
};

type ScreenErrorBoundaryState = {
  error: Error | null;
};

class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state: ScreenErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ScreenErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: ScreenErrorBoundaryProps) {
    if (previousProps.screen !== this.props.screen && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="screen-stack">
        <div className="card main-panel workspace-empty">
          <div>
            <div className="eyebrow">Recovery mode</div>
            <h1>Creator Studio could not render this state.</h1>
            <p>
              The app is still running, but this screen hit a frontend runtime
              error. This usually happens after a stale local Creator Studio
              session or an unexpected workspace payload.
            </p>
            <p className="muted small-note">
              {this.state.error.message || "Unknown frontend error"}
            </p>
          </div>
          <div className="action-row">
            <button
              className="primary-btn"
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onResetCreator();
              }}
            >
              Reset Creator Studio session
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onBackHome();
              }}
            >
              Back to overview
            </button>
          </div>
        </div>
      </section>
    );
  }
}

const CREATOR_PROFILE_STORAGE_KEY = "dscope_creator_profile_v1";

function readStoredCreatorProfile(): CreatorProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CREATOR_PROFILE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CreatorProfile>;
    if (!parsed.email || !parsed.organization || !parsed.status) return null;

    const allowedStatuses = new Set([
      "local_approved",
      "pending",
      "approved",
      "rejected",
      "pending_email_verification",
      "password_required",
      "pending_approval",
    ]);
    if (!allowedStatuses.has(String(parsed.status))) return null;

    return {
      organization: String(parsed.organization),
      email: String(parsed.email),
      website: parsed.website ? String(parsed.website) : null,
      logoUrl: parsed.logoUrl ? String(parsed.logoUrl) : null,
      status: parsed.status as CreatorProfile["status"],
      workspaceId: parsed.workspaceId ? String(parsed.workspaceId) : null,
    };
  } catch {
    return null;
  }
}

function creatorFromAuthResponse(
  response: Awaited<ReturnType<typeof getCreatorMe>>,
): CreatorProfile {
  const profile = response.account.profile;
  const workspace = response.workspace;
  const application = response.application;
  return {
    organization:
      workspace?.organizationName ??
      profile?.organizationName ??
      application?.organizationName ??
      response.account.email,
    email: response.account.email,
    website:
      workspace?.website ?? profile?.website ?? application?.website ?? null,
    logoUrl:
      workspace?.logoUrl ?? profile?.logoUrl ?? application?.logoUrl ?? null,
    status: workspace
      ? "approved"
      : ((application?.status ??
          response.account.status) as CreatorProfile["status"]),
    workspaceId: workspace?.id ?? application?.workspaceId ?? null,
  };
}

function storeCreatorProfile(profile: CreatorProfile | null): void {
  if (typeof window === "undefined") return;

  if (!profile) {
    window.localStorage.removeItem(CREATOR_PROFILE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    CREATOR_PROFILE_STORAGE_KEY,
    JSON.stringify(profile),
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [participantView, setParticipantView] =
    useState<ParticipantViewResponse | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(() =>
    readStoredCreatorProfile(),
  );
  const [wallet, setWallet] = useState<WalletConnection>(
    EMPTY_WALLET_CONNECTION,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);

  async function refreshSurveys() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await listMvpSurveys("all");
      const next = response.surveys.map(surveyFromSummary);
      setSurveys(next);
      if (next.length)
        setSelectedSurvey(
          (current) =>
            next.find((item) => item.id === current?.id) ?? next[0],
        );
      else setSelectedSurvey(null);
    } catch (error) {
      setSurveys([]);
      setSelectedSurvey(null);
      setMessage(
        `Campaigns could not be loaded. ${error instanceof Error ? error.message : "Please try again."}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function openSurvey(survey: Survey, nextScreen: Screen = "survey") {
    setMessage(null);
    setParticipantView(null);
    setSelectedSurvey(survey);

    if (survey.source === "backend") {
      try {
        const detail = await getMvpSurvey(survey.id);
        const hydrated = surveyFromDetail(detail);
        setSelectedSurvey(hydrated);
        setSurveys((items) =>
          items.map((item) => (item.id === hydrated.id ? hydrated : item)),
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load survey detail.",
        );
      }
    }

    setScreen(nextScreen);
  }

  async function refreshSelectedSurvey() {
    if (!selectedSurvey || selectedSurvey.source !== "backend") return;
    await openSurvey(selectedSurvey, screen);
  }

  function onSurveyCreated(survey: Survey) {
    setSurveys((items) => [
      survey,
      ...items.filter((item) => item.id !== survey.id),
    ]);
    setSelectedSurvey(survey);
    setScreen("creatorWorkspace");
  }

  function updateCreator(nextCreator: CreatorProfile | null) {
    setCreator(nextCreator);
    storeCreatorProfile(nextCreator);
  }

  function openCreatorStudio() {
    setMessage(null);
    setScreen(creator?.workspaceId ? "creatorWorkspace" : "creatorAccess");
  }

  async function signOutCreator() {
    try {
      await logoutCreator();
    } catch {
      // Session may already be expired; still clear the local shell state.
    }
    updateCreator(null);
    setMessage(
      "Creator Studio session cleared. Please sign in again with email and password.",
    );
    setScreen("creatorAccess");
  }

  async function onConnectAzguardWallet() {
    setWalletConnecting(true);
    setMessage(null);

    try {
      const nextWallet = await connectAzguardWallet();
      setWallet(nextWallet);
      setMessage(
        "Azguard connected. Your activity is scoped to the selected account.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not connect Azguard wallet. Make sure the extension is installed, unlocked, and available for this page.",
      );
    } finally {
      setWalletConnecting(false);
    }
  }

  useEffect(() => {
    void refreshSurveys();
    void getCreatorMe()
      .then((response) => {
        updateCreator(creatorFromAuthResponse(response));
      })
      .catch(() => {
        updateCreator(null);
      });
  }, []);

  return (
    <div className="app-shell">
      <Header
        screen={screen}
        setScreen={setScreen}
        creator={creator}
        onOpenCreatorStudio={openCreatorStudio}
        wallet={wallet}
        onUseLocalWallet={() => {
          if (PUBLIC_ENABLE_DEV_MODE) setWallet(LOCAL_DEV_WALLET_CONNECTION);
        }}
        onConnectAzguardWallet={() => void onConnectAzguardWallet()}
        onDisconnectWallet={() => setWallet(EMPTY_WALLET_CONNECTION)}
        walletConnecting={walletConnecting}
      />
      <main className="page-shell">
        <ScreenErrorBoundary
          screen={screen}
          onBackHome={() => {
            setMessage(null);
            setScreen("home");
          }}
          onResetCreator={() => {
            updateCreator(null);
            setMessage("Creator Studio session was reset on this device.");
            setScreen("creatorAccess");
          }}
        >
          {message && <div className="notice">{message}</div>}

          {screen === "home" && (
            <HomePage
              surveys={surveys}
              loading={loading}
              onRefresh={refreshSurveys}
              onOpenSurvey={(survey) => void openSurvey(survey)}
              setScreen={setScreen}
            />
          )}

          {screen === "explore" && (
            <ExplorePage
              surveys={surveys}
              loading={loading}
              onRefresh={refreshSurveys}
              onOpenSurvey={(survey) => void openSurvey(survey)}
              setScreen={setScreen}
            />
          )}

          {screen === "survey" && selectedSurvey && (
            <SurveyPage
              survey={selectedSurvey}
              wallet={wallet}
              onUseLocalWallet={() => {
                if (PUBLIC_ENABLE_DEV_MODE)
                  setWallet(LOCAL_DEV_WALLET_CONNECTION);
              }}
              setScreen={setScreen}
              setMessage={setMessage}
              onRefresh={refreshSelectedSurvey}
              participantView={participantView}
              setParticipantView={setParticipantView}
            />
          )}

          {screen === "results" && selectedSurvey && (
            <ResultsPage
              survey={selectedSurvey}
              setScreen={setScreen}
              onRefresh={refreshSelectedSurvey}
            />
          )}

          {(screen === "survey" || screen === "results") &&
            !selectedSurvey && (
              <section className="screen-stack">
                <div className="empty-card card">
                  <h3>No campaign selected</h3>
                  <p>
                    Return to Explorer and choose a campaign loaded from the
                    backend.
                  </p>
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => setScreen("explore")}
                  >
                    Open Explorer
                  </button>
                </div>
              </section>
            )}

          {screen === "activity" && (
            <ActivityPage
              wallet={wallet}
              onUseLocalWallet={() => {
                if (PUBLIC_ENABLE_DEV_MODE)
                  setWallet(LOCAL_DEV_WALLET_CONNECTION);
              }}
              setScreen={setScreen}
              setMessage={setMessage}
            />
          )}

          {screen === "creatorAccess" && (
            <CreatorAccessPage
              creator={creator}
              setCreator={updateCreator}
              setScreen={setScreen}
              setMessage={setMessage}
            />
          )}

          {screen === "creatorWorkspace" && (
            <CreatorWorkspace
              creator={creator}
              surveys={surveys}
              setScreen={setScreen}
              onOpenSurvey={(survey) =>
                void openSurvey(
                  survey,
                  canViewSurveyResults(survey) ? "results" : "survey",
                )
              }
              onRefresh={refreshSurveys}
              onSignOut={() => void signOutCreator()}
              setMessage={setMessage}
            />
          )}

          {screen === "builder" && (
            <SurveyBuilder
              creator={creator}
              onCreated={onSurveyCreated}
              setMessage={setMessage}
            />
          )}

          {PUBLIC_ENABLE_ADMIN && screen === "admin" && (
            <AdminPage setScreen={setScreen} setMessage={setMessage} />
          )}
        </ScreenErrorBoundary>
      </main>
    </div>
  );
}
