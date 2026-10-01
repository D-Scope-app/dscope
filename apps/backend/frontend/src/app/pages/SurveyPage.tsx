import { useMemo, useRef, useState } from "react";
import { NullifierType } from "@zkpassport/sdk";
import { ZKPassportQRCode } from "@zkpassport/ui/react";
import {
  createVerificationSession,
  getVerificationSessionStatus,
  submitZkPassportProofs,
  submitMvpResponse,
} from "../api";
import type {
  CompleteVerificationSessionResponse,
  CredentialIssueResult,
  MvpSurveyDetail,
  ParticipantPauseStatus,
  ParticipantSystemStatus,
  ParticipantViewResponse,
  ParticipationPlan,
  SurveyQuestion,
  SurveyPredicatePolicyV1,
} from "../types";
import type {
  Answers,
  Screen,
  Survey,
  SurveyStep,
  WalletConnection,
} from "../model";
import {
  canViewSurveyResults,
  effectiveSurveyStatus,
  formatTimeRemaining,
  isSurveyOpenForDiscovery,
  starterQuestions,
  shortHash,
  surveyStatusLabel,
} from "../model";
import { Fact, Metric } from "../components/Primitives";
import { sendAzguardParticipationTransaction } from "../wallet/azguard";
import { PUBLIC_SHOW_CONTRACT_DETAILS } from "../publicConfig";

function hasMeaningfulAnswer(value: Answers[string] | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function countMissingRequiredAnswers(
  questions: SurveyQuestion[],
  answers: Answers,
): number {
  return questions.filter(
    (question) =>
      question.required && !hasMeaningfulAnswer(answers[question.id]),
  ).length;
}

type EligibilityPolicySummary = {
  age: string;
  countries: string;
  regions: string;
  countryValues: string[];
  ageValues: string[];
};

const ZKPASSPORT_REGISTRY_URL = "https://registry.zkpassport.id/";

const AGE_BUCKET_LABELS: Record<string, string> = {
  "18_25": "18–25",
  "26_30": "26–30",
  "31_35": "31–35",
  "36_45": "36–45",
  "46_50": "46–50",
  "51_55": "51–55",
  "56_60": "56–60",
  "61_plus": "61+",
  other_unknown: "Other / unknown",
};

const REGION_LABELS: Record<string, string> = {
  EUROPE: "Europe",
  EECA: "Eastern Europe & Central Asia",
  NORTH_AMERICA: "North America",
  LATIN_AMERICA: "Latin America",
  MENA: "Middle East & North Africa",
  SUB_SAHARAN_AFRICA: "Sub-Saharan Africa",
  SOUTH_ASIA: "South Asia",
  SOUTHEAST_ASIA: "Southeast Asia",
  EAST_ASIA: "East Asia",
  OCEANIA: "Oceania",
  OTHER_UNKNOWN: "Other / unknown",
};

const countryDisplayNames =
  typeof Intl !== "undefined" &&
  typeof (Intl as unknown as { DisplayNames?: unknown }).DisplayNames ===
    "function"
    ? new (
        Intl as unknown as {
          DisplayNames: new (
            locales: string[],
            options: { type: "region" },
          ) => { of: (code: string) => string | undefined };
        }
      ).DisplayNames(["en"], { type: "region" })
    : null;

function countryLabel(countryCode: string): string {
  if (countryCode === "OTHER_UNKNOWN") return "Other / unknown";
  const name = countryDisplayNames?.of(countryCode);
  return name ? `${name} (${countryCode})` : countryCode;
}

function ageBucketLabel(bucket: string): string {
  return AGE_BUCKET_LABELS[bucket] ?? bucket;
}

function regionLabel(region: string): string {
  return REGION_LABELS[region] ?? region.replaceAll("_", " ").toLowerCase();
}

function formatPolicyList(
  values: string[],
  formatter: (value: string) => string,
  anyLabel: string,
): string {
  if (values.length === 0) return anyLabel;
  const formatted = values.map(formatter);
  if (formatted.length <= 4) return formatted.join(", ");
  return `${formatted.slice(0, 4).join(", ")} +${formatted.length - 4} more`;
}

function selectedPolicyValues(
  policy: SurveyPredicatePolicyV1 | null,
  key: "age" | "countries" | "regions",
): string[] {
  if (!policy) return [];

  if (key === "age") {
    return policy.age?.mode === "bucket_in" ? (policy.age.buckets ?? []) : [];
  }

  if (key === "countries") {
    return policy.countries?.mode === "allow_list"
      ? (policy.countries.values ?? [])
      : [];
  }

  return policy.regions?.mode === "allow_list"
    ? (policy.regions.values ?? [])
    : [];
}

function buildEligibilityPolicySummary(
  policy: SurveyPredicatePolicyV1 | null,
): EligibilityPolicySummary {
  const ageValues = selectedPolicyValues(policy, "age");
  const countryValues = selectedPolicyValues(policy, "countries");
  const regionValues = selectedPolicyValues(policy, "regions");

  return {
    ageValues,
    countryValues,
    age: formatPolicyList(ageValues, ageBucketLabel, "Any verified age bucket"),
    countries: formatPolicyList(
      countryValues,
      countryLabel,
      "Any supported country",
    ),
    regions: formatPolicyList(regionValues, regionLabel, "Any region"),
  };
}

function firstSelectedPolicyCountry(
  policy: SurveyPredicatePolicyV1 | null,
): string {
  const countries = selectedPolicyValues(policy, "countries").filter(
    (value) => value !== "OTHER_UNKNOWN",
  );
  return countries[0] ?? "RU";
}

function firstSelectedAgeBucket(
  policy: SurveyPredicatePolicyV1 | null,
): string {
  const buckets = selectedPolicyValues(policy, "age").filter(
    (value) => value !== "other_unknown",
  );
  return buckets[0] ?? "31_35";
}

export function SurveyPage({
  survey,
  wallet,
  onUseLocalWallet,
  setScreen,
  setMessage,
  onRefresh,
  participantView,
  setParticipantView,
}: {
  survey: Survey;
  wallet: WalletConnection;
  onUseLocalWallet: () => void;
  setScreen: (screen: Screen) => void;
  setMessage: (message: string | null) => void;
  onRefresh: () => void;
  participantView: ParticipantViewResponse | null;
  setParticipantView: (view: ParticipantViewResponse | null) => void;
}) {
  const [step, setStep] = useState<SurveyStep>("overview");
  const [verified, setVerified] = useState(false);
  const [credentialIssue, setCredentialIssue] =
    useState<CredentialIssueResult | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  const questions = survey.detail?.metadata.questions ?? starterQuestions;
  const contracts = survey.detail?.contracts;
  const predicatePolicy = survey.detail?.survey.predicatePolicyJson ?? null;
  const policySummary = useMemo(
    () => buildEligibilityPolicySummary(predicatePolicy),
    [predicatePolicy],
  );
  const participantRef = wallet.participantRef;
  const credentialRecipient = wallet.accountAddress ?? wallet.participantRef;

  const verificationContext = useMemo(
    () => ({
      surveyId: survey.id,
      surveyKey: survey.surveyKey,
      participantRef: participantRef ?? "",
      credentialRecipient: credentialRecipient ?? "",
    }),
    [survey.id, survey.surveyKey, participantRef, credentialRecipient],
  );

  const verificationSessionRef =
    useRef<TrustedVerificationSession | null>(null);

  const effectiveCredentialIssue =
    credentialIssue ?? participantView?.credentialIssue ?? null;
  const participationPlan = participantView?.participationPlan ?? null;
  const systemStatus = participantView?.systemStatus ?? null;
  const pauseStatus = systemStatus?.participationPause ?? null;
  const participationPaused = pauseStatus?.paused === true;
  const surveyOpen =
    survey.source !== "backend"
      ? true
      : (participantView?.availability.canParticipate ??
        isSurveyOpenForDiscovery(survey));
  const surveyEnded = effectiveSurveyStatus(survey) === "ended";
  const alreadyParticipated =
    participantView?.participant.hasParticipated === true ||
    participationPlan?.nextAction === "already_participated";
  const credentialReady =
    alreadyParticipated ||
    effectiveCredentialIssue?.status === "issued" ||
    participationPlan?.nextAction === "wallet_participate";
  const canAnswerSurvey =
    surveyOpen &&
    !alreadyParticipated &&
    (survey.source === "backend" ? credentialReady : verified);
  const missingRequiredAnswers = countMissingRequiredAnswers(
    questions,
    answers,
  );
  const requiredAnswersComplete = missingRequiredAnswers === 0;
  const canProceedToSign = canAnswerSurvey && requiredAnswersComplete;


  async function waitForCredentialReadiness() {
    const activeSession = verificationSessionRef.current;

    if (!activeSession) {
      setMessage(
        "Verification session is unavailable. Please restart verification.",
      );
      return;
    }

    setBusy(true);

    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const result = await getVerificationSessionStatus({
          sessionId: activeSession.id,
          clientToken: activeSession.clientToken,
        });

        const eligible = result.policyDecision?.eligible !== false;
        if (!eligible) {
          setVerified(false);
          setCredentialIssue(result.credentialIssue ?? null);
          setMessage(
            result.policyDecision?.reasonCode ||
              "This wallet is not eligible for the selected survey",
          );
          setStep("verify");
          return;
        }

        const nextCredentialIssue = result.credentialIssue ?? null;

        setVerified(true);
        setCredentialIssue(nextCredentialIssue);

        if (nextCredentialIssue?.status === "issued") {
          setMessage(
            `Eligibility verified and Aztec credential issued: ${shortHash(
              nextCredentialIssue.txHash,
            )}`,
          );
          setStep("respond");
          return;
        }

        if (nextCredentialIssue?.status === "failed") {
          setMessage(
            `Eligibility verified, but credential issuance failed: ${nextCredentialIssue.reason ?? "unknown error"}`,
          );
          setStep("verify");
          return;
        }

        setMessage(
          `Eligibility verified. Issuing Aztec credential${nextCredentialIssue?.jobId ? ` (${shortHash(nextCredentialIssue.jobId)})` : ""}…`,
        );

        if (attempt < 59) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 2_000);
          });
        }
      }

      setMessage(
        "Eligibility is verified, but credential issuance is taking longer than expected.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not refresh credential status",
      );
    } finally {
      setBusy(false);
    }
  }

  function applyVerificationResult(
    result: CompleteVerificationSessionResponse,
    activeSession: TrustedVerificationSession,
  ) {
    verificationSessionRef.current = activeSession;
    const eligible = result.policyDecision?.eligible !== false;
    if (!eligible) {
      throw new Error(
        result.policyDecision?.reasonCode ||
          "This wallet is not eligible for the selected survey",
      );
    }

    const nextCredentialIssue = result.credentialIssue ?? null;
    setCredentialIssue(nextCredentialIssue);
    setVerified(true);

    if (nextCredentialIssue?.status === "issued") {
      setMessage(
        `Eligibility verified and Aztec credential issued: ${shortHash(
          nextCredentialIssue.txHash,
        )}`,
      );
      setStep("respond");
      return;
    }

    if (nextCredentialIssue?.status === "failed") {
      setMessage(
        `Eligibility verified, but credential issuance failed: ${nextCredentialIssue.reason ?? "unknown error"}`,
      );
      setStep("verify");
      return;
    }

    setMessage(
      `Eligibility verified. Issuing Aztec credential${nextCredentialIssue?.jobId ? ` (${shortHash(nextCredentialIssue.jobId)})` : ""}…`,
    );
    setStep("verify");
    void waitForCredentialReadiness();
  }

  function answerQuestion(question: SurveyQuestion, value: string) {
    setAnswers((current) => {
      if (question.type === "multiple_choice") {
        const existing = Array.isArray(current[question.id])
          ? (current[question.id] as string[])
          : [];
        return {
          ...current,
          [question.id]: existing.includes(value)
            ? existing.filter((item) => item !== value)
            : [...existing, value],
        };
      }
      return { ...current, [question.id]: value };
    });
  }

  async function submitResponse() {
    console.info("[D-Scope] submitResponse state", { alreadyParticipated, surveyOpen, hasParticipantRef: Boolean(participantRef), credentialReady, verified, requiredAnswersComplete, participationPaused, surveySource: survey.source, hasSession: Boolean(verificationSessionRef.current), walletSource: wallet.source });
    if (alreadyParticipated) {
      setMessage("This wallet has already participated in this survey.");
      setStep("confirmed");
      return;
    }

    if (!surveyOpen) {
      setMessage("This survey has ended. Participation is closed.");
      setStep("overview");
      return;
    }

    if (!participantRef) {
      setMessage("Connect a wallet first to continue.");
      return;
    }

    const participationCredentialReady =
      survey.source === "backend" ? credentialReady : verified;

    if (!participationCredentialReady) {
      setMessage(
        survey.source === "backend"
          ? "Wait for the Aztec credential before recording participation."
          : "Verify eligibility before answering.",
      );
      setStep("verify");
      return;
    }

    if (!requiredAnswersComplete) {
      setMessage(
        missingRequiredAnswers === 1
          ? "Answer the required question before recording participation."
          : `Answer ${missingRequiredAnswers} required questions before recording participation.`,
      );
      setStep("respond");
      return;
    }

    if (participationPaused) {
      setMessage(participationPauseMessage(pauseStatus));
      setStep("sign");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (survey.source === "backend") {
        const activeSession = verificationSessionRef.current;

        if (!activeSession) {
          throw new Error(
            "Verification session is unavailable. Restart verification.",
          );
        }

        const latestVerification = await getVerificationSessionStatus({
          sessionId: activeSession.id,
          clientToken: activeSession.clientToken,
        });

        const latestParticipationPlan = (latestVerification as
          CompleteVerificationSessionResponse & {
            participationPlan?: ParticipationPlan | null;
          }).participationPlan ?? null;

        const activeParticipationPlan =
          latestParticipationPlan ?? participationPlan;
        const latestCredentialIssue =
          latestVerification.credentialIssue ?? credentialIssue;

        setCredentialIssue(latestCredentialIssue ?? null);

        if (latestCredentialIssue?.status !== "issued") {
          throw new Error(
            "Aztec eligibility credential is not issued yet.",
          );
        }

        if (!activeParticipationPlan?.contractCall) {
          throw new Error(
            "Server did not return an Aztec participation call. Refresh eligibility status.",
          );
        }

        if (wallet.source !== "azguard") {
          throw new Error(
            "Connect Azguard wallet to record on-chain participation.",
          );
        }

        setMessage("Opening Azguard participation transaction…");

        const participationTxHash =
          await sendAzguardParticipationTransaction({
            participationPlan: activeParticipationPlan,
            participantAddress: wallet.accountAddress ?? participantRef,
          });

        await submitMvpResponse({
          surveyId: survey.id,
          participantRef,
          answers,
          participationTxHash,
          verificationSessionId: activeSession.id,
          clientToken: activeSession.clientToken,
        });

      }
      setStep("confirmed");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not submit response",
      );
    } finally {
      setBusy(false);
    }
  }


  function requestStep(nextStep: SurveyStep) {
    if (nextStep === "overview") {
      setStep(nextStep);
      return;
    }

    if (!surveyOpen && nextStep !== "confirmed") {
      setMessage("This survey has ended. Participation is closed.");
      setStep("overview");
      return;
    }

    if (nextStep === "verify") {
      setStep(nextStep);
      return;
    }

    if (alreadyParticipated) {
      setMessage("This wallet has already participated in this survey.");
      setStep("confirmed");
      return;
    }

    if (!canAnswerSurvey) {
      setMessage(
        "Verify eligibility and wait for the Aztec credential before answering.",
      );
      setStep("verify");
      return;
    }

    if (nextStep === "respond") {
      setStep("respond");
      return;
    }

    if (!requiredAnswersComplete) {
      setMessage(
        missingRequiredAnswers === 1
          ? "Answer the required question before continuing."
          : `Answer ${missingRequiredAnswers} required questions before continuing.`,
      );
      setStep("respond");
      return;
    }

    if (nextStep === "sign") {
      setStep("sign");
      return;
    }

    setMessage(
      "Confirmation appears after successful participation recording.",
    );
    setStep("sign");
  }

  return (
    <section className="survey-layout">
      <aside className="card side-panel">
        <button
          className="text-link"
          type="button"
          onClick={() => setScreen("explore")}
        >
          ← Explore
        </button>
        <h2>{survey.title}</h2>
        <p className="muted">{survey.description}</p>
        <div className="step-list">
          {(
            [
              "overview",
              "verify",
              "respond",
              "sign",
              "confirmed",
            ] as SurveyStep[]
          ).map((item, index) => (
            <button
              key={item}
              className={step === item ? "active" : ""}
              type="button"
              onClick={() => requestStep(item)}
            >
              <span>{index + 1}</span>
              {stepLabel(item)}
            </button>
          ))}
        </div>
        <div className="mini-card public-survey-summary">
          <Fact label="Audience" value="verified eligibility" />
          <Fact label="Status" value={surveyStatusLabel(survey)} />
          <Fact label="Questions" value={String(questions.length)} />
        </div>
      </aside>

      <div className="card main-panel">
        <ParticipationPauseNotice pauseStatus={pauseStatus} />
        {step === "overview" && (
          <SurveyOverview
            survey={survey}
            surveyOpen={surveyOpen}
            surveyEnded={surveyEnded}
            contracts={contracts}
            policySummary={policySummary}
            wallet={wallet}
            onUseLocalWallet={onUseLocalWallet}
            setStep={setStep}
            setScreen={setScreen}
            onRefresh={onRefresh}
          />
        )}
        {step === "verify" && (
          <VerifyEligibilityPanel
            busy={busy}
            verified={verified}
            context={verificationContext}
            policySummary={policySummary}
            credentialIssue={effectiveCredentialIssue}
            systemStatus={systemStatus}
            onVerified={applyVerificationResult}
            setMessage={setMessage}
          />
        )}
        {step === "respond" && (
          <RespondPanel
            questions={questions}
            answers={answers}
            canAnswer={canAnswerSurvey}
            canContinue={canProceedToSign}
            missingRequiredCount={missingRequiredAnswers}
            answerQuestion={answerQuestion}
            onContinue={() => requestStep("sign")}
          />
        )}
        {step === "sign" && (
          <SignParticipationPanel
            busy={busy}
            contracts={contracts}
            credentialIssue={effectiveCredentialIssue}
            participationPlan={participationPlan}
            systemStatus={systemStatus}
            pauseStatus={pauseStatus}
            answersReady={requiredAnswersComplete}
            missingRequiredCount={missingRequiredAnswers}
            alreadyParticipated={alreadyParticipated}
            onSubmit={submitResponse}
          />
        )}
        {step === "confirmed" && (
          <ConfirmationPanel
            participantView={participantView}
            onResults={() => setScreen("results")}
          />
        )}
      </div>
    </section>
  );
}

function stepLabel(step: SurveyStep) {
  if (step === "overview") return "Overview";
  if (step === "verify") return "Verify eligibility";
  if (step === "respond") return "Answer survey";
  if (step === "sign") return "Sign participation";
  return "Confirmation";
}

function SurveyOverview({
  survey,
  surveyOpen,
  surveyEnded,
  contracts,
  policySummary,
  wallet,
  onUseLocalWallet,
  setStep,
  setScreen,
  onRefresh,
}: {
  survey: Survey;
  surveyOpen: boolean;
  surveyEnded: boolean;
  contracts: MvpSurveyDetail["contracts"] | undefined;
  policySummary: EligibilityPolicySummary;
  wallet: WalletConnection;
  onUseLocalWallet: () => void;
  setStep: (step: SurveyStep) => void;
  setScreen: (screen: Screen) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="content-stack respondent-overview">
      <div className="respondent-hero card">
        <div>
          <span className="eyebrow">Research campaign</span>
          <h1>{survey.title}</h1>
          <p>{survey.description}</p>
        </div>
        <div className="respondent-hero-facts">
          <Metric
            label="Questions"
            value={String(survey.questionsCount || starterQuestions.length)}
          />
          <Metric label="Status" value={surveyStatusLabel(survey)} />
          <Metric
            label={surveyOpen ? "Time left" : "Participation"}
            value={
              surveyOpen
                ? formatTimeRemaining(survey.schedule?.timeRemainingSeconds)
                : surveyEnded
                  ? "closed"
                  : surveyStatusLabel(survey)
            }
          />
        </div>
      </div>

      {!surveyOpen && (
        <div className="soft-panel survey-ended-panel">
          <h3>
            {surveyEnded ? "Campaign ended" : "Participation unavailable"}
          </h3>
          <p>
            This campaign is no longer accepting responses. Aggregate results
            become available only after D-Scope finalization completes.
          </p>
        </div>
      )}

      <EligibilityRequirementsCard policySummary={policySummary} />

      <div className="info-grid respondent-trust-grid">
        <div className="soft-panel">
          <h3>Private eligibility check</h3>
          <p>
            D-Scope checks only whether you match this campaign’s requirements.
            The creator does not receive your passport image, full identity
            document, or raw personal details.
          </p>
        </div>
        <div className="soft-panel">
          <h3>Aggregate results only</h3>
          <p>
            Your response contributes to aggregate analytics after finalization.
            Individual respondent records are not shown to the creator.
          </p>
        </div>
      </div>

      <VerificationCoverageNotice />

      {PUBLIC_SHOW_CONTRACT_DETAILS && (
        <div className="soft-panel">
          <h3>Contract status</h3>
          <Fact
            label="Participation gate"
            value={shortHash(contracts?.participationGateAddress)}
          />
          <Fact label="Core" value={shortHash(contracts?.dscopeCoreAddress)} />
        </div>
      )}

      <div className="wallet-callout respondent-wallet-callout">
        <div>
          <strong>
            {wallet.connected ? "Wallet ready" : "Connect wallet"}
          </strong>
          <span>
            {wallet.connected
              ? "Wallet connected. You can start the private eligibility check."
              : "Connect a compatible Aztec wallet to verify eligibility and participate."}
          </span>
        </div>
      </div>

      <div className="action-row">
        <button
          className="primary-btn"
          type="button"
          onClick={() => setStep("verify")}
          disabled={!wallet.connected || !surveyOpen}
        >
          {surveyOpen ? "Check eligibility" : "Participation closed"}
        </button>
        <button
          className="secondary-btn"
          type="button"
          onClick={() => setScreen("results")}
          disabled={!canViewSurveyResults(survey)}
        >
          {canViewSurveyResults(survey)
            ? "View results"
            : "Results after finalization"}
        </button>
        <button className="ghost-btn" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </div>
  );
}

function EligibilityRequirementsCard({
  policySummary,
}: {
  policySummary: EligibilityPolicySummary;
}) {
  return (
    <div className="card eligibility-requirements-card">
      <div className="card-row align-start">
        <div>
          <span className="eyebrow">Who can participate</span>
          <h3>Campaign requirements</h3>
          <p className="muted">
            These requirements come from this specific research campaign, not
            from a static demo list.
          </p>
        </div>
        <span className="pill pill-blue">
          one response per verified respondent
        </span>
      </div>
      <div className="eligibility-requirement-grid">
        <Fact label="Age" value={policySummary.age} />
        <Fact label="Country" value={policySummary.countries} />
        <Fact label="Region" value={policySummary.regions} />
      </div>
    </div>
  );
}

function VerificationCoverageNotice() {
  return (
    <div className="soft-panel verification-coverage-notice">
      <div>
        <h3>Verification availability</h3>
        <p>
          D-Scope uses private verification providers. Availability depends on
          supported documents and countries.
        </p>
      </div>
      <a
        className="secondary-btn coverage-link"
        href={ZKPASSPORT_REGISTRY_URL}
        target="_blank"
        rel="noreferrer"
      >
        View current zkPassport support list
      </a>
    </div>
  );
}

const ZKPASSPORT_DOMAIN = "app.dscope.app";
const ZKPASSPORT_REQUEST_NAME = "D-Scope";
const ZKPASSPORT_REQUEST_PURPOSE =
  "Private eligibility check for a D-Scope research campaign";

function participationPauseMessage(
  pauseStatus: ParticipantPauseStatus | null,
): string {
  return (
    pauseStatus?.message ||
    "Participation is temporarily paused by the D-Scope operator. Your verification state is saved; please try again later."
  );
}

function ParticipationPauseNotice({
  pauseStatus,
}: {
  pauseStatus: ParticipantPauseStatus | null;
}) {
  if (!pauseStatus?.paused) return null;

  return (
    <div className="soft-panel pause-status-panel">
      <h3>Participation temporarily paused</h3>
      <p>{participationPauseMessage(pauseStatus)}</p>
      {PUBLIC_SHOW_CONTRACT_DETAILS && (
        <div className="queue-status-facts">
          <Fact label="Scope" value={pauseStatus.scope ?? "operator"} />
          <Fact label="Reason" value={pauseStatus.reason ?? "operator_pause"} />
          <Fact
            label="Updated"
            value={
              pauseStatus.updatedAt
                ? new Date(pauseStatus.updatedAt).toLocaleString()
                : "unknown"
            }
          />
        </div>
      )}
    </div>
  );
}

function credentialQueueMessage(
  systemStatus: ParticipantSystemStatus | null,
): string {
  if (!systemStatus) {
    return "Eligibility is verified, but the Aztec credential is still being issued. Refresh the participant view in a few seconds.";
  }

  if (!systemStatus.credentialServiceAlive) {
    return "Eligibility is verified, but the credential issuer has not checked in recently. Your verification is saved; refresh again in a few minutes.";
  }

  if (systemStatus.credentialBacklogLevel === "high_demand") {
    return `Eligibility is verified. High demand: ${systemStatus.credentialPendingJobs} credential job(s) are queued. No need to verify again.`;
  }

  if (systemStatus.credentialBacklogLevel === "queued") {
    return `Eligibility is verified. Your credential is queued behind ${systemStatus.credentialPendingJobs} pending job(s). No need to verify again.`;
  }

  return "Eligibility is verified. The Aztec credential is still being issued; no need to verify again.";
}

function shouldShowCredentialQueueNotice(
  credentialIssue: CredentialIssueResult | null,
  participationPlan: ParticipationPlan | null,
  systemStatus: ParticipantSystemStatus | null,
): boolean {
  return (
    credentialIssue?.status === "pending" ||
    credentialIssue?.status === "running" ||
    participationPlan?.nextAction === "credential_pending" ||
    systemStatus?.credentialBacklogLevel === "queued" ||
    systemStatus?.credentialBacklogLevel === "high_demand" ||
    systemStatus?.credentialServiceAlive === false
  );
}

function CredentialQueueNotice({
  credentialIssue,
  participationPlan,
  systemStatus,
}: {
  credentialIssue: CredentialIssueResult | null;
  participationPlan: ParticipationPlan | null;
  systemStatus: ParticipantSystemStatus | null;
}) {
  if (
    !shouldShowCredentialQueueNotice(
      credentialIssue,
      participationPlan,
      systemStatus,
    )
  ) {
    return null;
  }

  const serviceAlive = systemStatus?.credentialServiceAlive ?? true;
  const backlogLevel = systemStatus?.credentialBacklogLevel ?? "normal";
  const pendingJobs = systemStatus?.credentialPendingJobs ?? 0;
  const runningJobs = systemStatus?.credentialRunningJobs ?? 0;

  return (
    <div
      className={`soft-panel queue-status-panel ${serviceAlive ? "" : "queue-status-panel-danger"}`}
    >
      <h3>{serviceAlive ? "Credential queue" : "Credential issuer delayed"}</h3>
      <p>
        {serviceAlive
          ? credentialQueueMessage(systemStatus)
          : "The credential issuer heartbeat is stale. Your verification state is saved, so do not restart the proof unless the page asks you to."}
      </p>
      {PUBLIC_SHOW_CONTRACT_DETAILS && (
        <div className="queue-status-facts">
          <Fact label="Backlog" value={backlogLevel} />
          <Fact label="Pending" value={String(pendingJobs)} />
          <Fact label="Running" value={String(runningJobs)} />
          <Fact
            label="Issuer heartbeat"
            value={
              systemStatus?.credentialServiceAgeSeconds === null ||
              systemStatus?.credentialServiceAgeSeconds === undefined
                ? "unknown"
                : `${systemStatus.credentialServiceAgeSeconds}s ago`
            }
          />
        </div>
      )}
    </div>
  );
}

type ZKPassportResultPayload = {
  verified?: boolean;
  result?: unknown;
  proofs?: unknown;
  uniqueIdentifier?: unknown;
  uniqueIdentifierType?: unknown;
};

type TrustedVerificationSession = {
  id: string;
  clientToken: string;
  verifierUrl: string;
  request: {
    domain: string;
    scope: string;
    binding: string;
    validitySeconds: number;
    queryHash: string;
  };
};

function VerifyEligibilityPanel({
  busy,
  verified,
  context,
  policySummary,
  credentialIssue,
  systemStatus,
  onVerified,
  setMessage,
}: {
  busy: boolean;
  verified: boolean;
  context: {
    surveyId: string;
    surveyKey: string;
    participantRef: string;
    credentialRecipient: string;
  };
  policySummary: EligibilityPolicySummary;
  credentialIssue: CredentialIssueResult | null;
  systemStatus: ParticipantSystemStatus | null;
  onVerified: (
    result: CompleteVerificationSessionResponse,
    activeSession: TrustedVerificationSession,
  ) => void;
  setMessage: (message: string | null) => void;
}) {
  const [zkStatus, setZkStatus] = useState<
    "idle" | "creating" | "qr_ready" | "verifying" | "completed" | "failed"
  >("idle");
  const [session, setSession] = useState<TrustedVerificationSession | null>(
    null,
  );
  const [zkError, setZkError] = useState<string | null>(null);
  const originalQueryRef = useRef<unknown>(null);

  async function startZkPassportFlow() {
    if (!context.credentialRecipient) {
      setMessage(
        "Connect wallet first. Verification must be linked to the selected participant account.",
      );
      return;
    }

    setZkStatus("creating");
    setZkError(null);
    setMessage(null);
    setSession(null);
    originalQueryRef.current = null;

    try {
      const session = await createVerificationSession({
        surveyId: context.surveyId,
        walletAddress: context.credentialRecipient,
      });
      const nextSessionId = session.verificationSession?.id;
      if (!nextSessionId || !session.clientToken || !session.verifierUrl)
        throw new Error("Backend did not return verification session id");

      setSession({
        id: nextSessionId,
        clientToken: session.clientToken,
        verifierUrl: session.verifierUrl,
        request: session.request,
      });
      setZkStatus("qr_ready");
    } catch (error) {
      setZkStatus("failed");
      setZkError(
        error instanceof Error
          ? error.message
          : "Could not create backend verification session",
      );
    }
  }

  async function waitForServerVerification(active: TrustedVerificationSession) {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      const result = await getVerificationSessionStatus({
        sessionId: active.id,
        clientToken: active.clientToken,
      });
      const verificationSession = result.verificationSession as
        | { status?: string; errorCode?: string | null }
        | undefined;
      const status = verificationSession?.status;

      if (status === "verified") {
        setZkStatus("completed");
        onVerified(result, active);
        return;
      }
      if (status === "failed" || status === "expired") {
        throw new Error(
          verificationSession?.errorCode ||
            (status === "expired"
              ? "Verification session expired"
              : "Server-side zkPassport verification failed"),
        );
      }
    }

    throw new Error(
      "Server verification is taking longer than expected. Restart the verification request.",
    );
  }

  async function handleZkPassportResult(payload: ZKPassportResultPayload) {
    if (!session) {
      setZkStatus("failed");
      setZkError(
        "Backend verification session is missing. Restart verification.",
      );
      return;
    }

    try {
      if (!payload.verified) {
        throw new Error("zkPassport returned an unverified result.");
      }
      if (!payload.proofs || !payload.result || !originalQueryRef.current) {
        throw new Error("zkPassport proof package is incomplete.");
      }

      setZkStatus("verifying");
      await submitZkPassportProofs({
        verifierUrl: session.verifierUrl,
        sessionId: session.id,
        clientToken: session.clientToken,
        proofs: payload.proofs,
        originalQuery: originalQueryRef.current,
        queryResult: payload.result,
        providerPayloadVersion:
          "zkpassport-ui-0.16.0-bound-server-verified-v1",
      });
      await waitForServerVerification(session);
    } catch (error) {
      setZkStatus("failed");
      setZkError(
        error instanceof Error
          ? error.message
          : "Could not complete backend verification",
      );
    }
  }

  return (
    <div className="content-stack respondent-verify-flow">
      <div className="page-title compact">
        <span>Private eligibility check</span>
        <h1>Check whether you match this campaign.</h1>
        <p>
          D-Scope verifies only the requirements needed for this research
          campaign. The creator does not receive your full identity document or
          raw personal profile.
        </p>
      </div>

      <EligibilityRequirementsCard policySummary={policySummary} />

      <div className="info-grid respondent-trust-grid">
        <div className="soft-panel">
          <h3>What is checked</h3>
          <ul className="clean-list">
            <li>Whether you match the campaign requirements</li>
            <li>Minimal attributes used for aggregate segmentation</li>
            <li>Whether this participant has already responded</li>
          </ul>
        </div>
        <div className="soft-panel">
          <h3>What is not shared</h3>
          <ul className="clean-list">
            <li>Your passport image</li>
            <li>Your full identity document</li>
            <li>Individual respondent analytics for the creator</li>
          </ul>
        </div>
      </div>

      <VerificationCoverageNotice />

      <div className="verification-card public-verification-card">
        <div className="verification-main">
          <div>
            <span className="eyebrow">Powered by zkPassport</span>
            <h3>Start private verification</h3>
            <p className="muted">
              Scan the QR request with zkPassport. D-Scope will use the returned
              minimized proof result to check this campaign’s eligibility
              policy.
            </p>
          </div>
          <span
            className={`pill ${zkStatus === "completed" ? "pill-green" : zkStatus === "failed" ? "pill-red" : "pill-blue"}`}
          >
            {statusLabel(zkStatus)}
          </span>
        </div>
        {session && zkStatus === "qr_ready" && (
          <div className="zkpassport-official-wrap">
            <div className="zkpassport-config-meta">
              <span>Domain: {ZKPASSPORT_DOMAIN}</span>
              <span>Proof request: age + nationality</span>
              {PUBLIC_SHOW_CONTRACT_DETAILS && (
                <span>Session: {shortHash(session.id)}</span>
              )}
            </div>
            <ZKPassportQRCode
              key={session.id}
              domain={session.request.domain}
              name={ZKPASSPORT_REQUEST_NAME}
              purpose={ZKPASSPORT_REQUEST_PURPOSE}
              scope={session.request.scope}
              validity={session.request.validitySeconds}
              devMode={false}
              uniqueIdentifierType={NullifierType.NON_SALTED}
              query={(builder) => {
                const built = builder
                  .gte("age", 18)
                  .disclose("nationality")
                  .disclose("birthdate")
                  .bind("custom_data", session.request.binding)
                  .done();
                originalQueryRef.current = built.query;
                return built;
              }}
              onResult={handleZkPassportResult}
            />
          </div>
        )}
        {zkError && <p className="error-text">{zkError}</p>}
        {credentialIssue && (
          <div className="soft-panel credential-status-panel">
            <h3>Eligibility credential</h3>
            <Fact label="Status" value={credentialIssue.status} />
            {credentialIssue.status === "issued" && (
              <p className="muted">
                Your eligibility credential is ready. Continue to answer the
                survey.
              </p>
            )}
            {PUBLIC_SHOW_CONTRACT_DETAILS &&
              credentialIssue.status === "issued" && (
                <>
                  <Fact
                    label="Credential tx"
                    value={shortHash(credentialIssue.txHash)}
                  />
                  <Fact
                    label="Gate"
                    value={shortHash(credentialIssue.participationGateAddress)}
                  />
                </>
              )}
            {credentialIssue.status !== "issued" && (
              <p className="muted">{credentialIssue.reason}</p>
            )}
          </div>
        )}
        <CredentialQueueNotice
          credentialIssue={credentialIssue}
          participationPlan={null}
          systemStatus={systemStatus}
        />
        <div className="action-row">
          <button
            className="primary-btn"
            type="button"
            onClick={startZkPassportFlow}
            disabled={
              busy ||
              verified ||
              zkStatus === "creating" ||
              zkStatus === "verifying"
            }
          >
            {verified
              ? "Eligibility checked"
              : zkStatus === "creating"
                ? "Creating request…"
                : zkStatus === "verifying"
                  ? "Verifying proof on server…"
                : "Check eligibility"}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusLabel(
  status:
    | "idle"
    | "creating"
    | "qr_ready"
    | "verifying"
    | "completed"
    | "failed",
) {
  if (status === "idle") return "ready";
  if (status === "creating") return "creating";
  if (status === "qr_ready") return "scan QR";
  if (status === "verifying") return "server verification";
  if (status === "completed") return "verified";
  return "failed";
}

function RespondPanel({
  questions,
  answers,
  canAnswer,
  canContinue,
  missingRequiredCount,
  answerQuestion,
  onContinue,
}: {
  questions: SurveyQuestion[];
  answers: Answers;
  canAnswer: boolean;
  canContinue: boolean;
  missingRequiredCount: number;
  answerQuestion: (question: SurveyQuestion, value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="content-stack">
      <div className="page-title compact">
        <span>Survey response</span>
        <h1>Answer the campaign questions.</h1>
        <p>
          Your answers are submitted to D-Scope and shown to the creator only as
          aggregate results after finalization.
        </p>
      </div>
      {!canAnswer && (
        <div className="soft-panel">
          Check eligibility and wait until your private eligibility credential
          is ready before answering this campaign.
        </div>
      )}
      <div className="question-list">
        {questions.map((question, index) => (
          <div className="question-card" key={question.id}>
            <div className="question-head">
              <span>{index + 1}</span>
              <h3>{question.title}</h3>
            </div>
            {question.type === "short_text" ? (
              <textarea
                value={String(answers[question.id] ?? "")}
                onChange={(event) =>
                  answerQuestion(question, event.target.value)
                }
                placeholder="Write a short answer…"
                disabled={!canAnswer}
              />
            ) : (
              <div className="option-grid">
                {(question.options ?? []).map((option) => {
                  const selected =
                    question.type === "multiple_choice"
                      ? Array.isArray(answers[question.id]) &&
                        (answers[question.id] as string[]).includes(option)
                      : answers[question.id] === option;
                  return (
                    <button
                      className={selected ? "selected" : ""}
                      key={option}
                      type="button"
                      onClick={() => answerQuestion(question, option)}
                      disabled={!canAnswer}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {canAnswer && missingRequiredCount > 0 && (
        <p className="muted">
          {missingRequiredCount === 1
            ? "Answer the required question to continue."
            : `Answer ${missingRequiredCount} required questions to continue.`}
        </p>
      )}
      <button
        className="primary-btn"
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
      >
        {!canAnswer
          ? "Verify eligibility first"
          : canContinue
            ? "Continue to participation"
            : "Answer required questions"}
      </button>
    </div>
  );
}

function SignParticipationPanel({
  busy,
  contracts,
  credentialIssue,
  participationPlan,
  systemStatus,
  pauseStatus,
  answersReady,
  missingRequiredCount,
  alreadyParticipated,
  onSubmit,
}: {
  busy: boolean;
  contracts: MvpSurveyDetail["contracts"] | undefined;
  credentialIssue: CredentialIssueResult | null;
  participationPlan: ParticipationPlan | null;
  systemStatus: ParticipantSystemStatus | null;
  pauseStatus: ParticipantPauseStatus | null;
  answersReady: boolean;
  missingRequiredCount: number;
  alreadyParticipated: boolean;
  onSubmit: () => void;
}) {
  const walletReady =
    participationPlan?.nextAction === "wallet_participate" ||
    credentialIssue?.status === "issued";
  const participationPaused = pauseStatus?.paused === true;

  return (
    <div className="content-stack">
      <div className="page-title compact">
        <span>Confirm participation</span>
        <h1>Confirm your response with wallet.</h1>
        <p>
          Your wallet helps record one private participation for this campaign.
          This prevents duplicate participation without exposing your answers
          publicly.
        </p>
      </div>
      <div className="soft-panel public-participation-status">
        <h3>Participation readiness</h3>
        <Fact
          label="Eligibility credential"
          value={credentialIssue?.status ?? "not checked"}
        />
        <Fact label="Answers" value={answersReady ? "ready" : "incomplete"} />
        <Fact
          label="Next step"
          value={
            participationPlan?.nextAction === "wallet_participate"
              ? "wallet confirmation"
              : "waiting"
          }
        />
        {PUBLIC_SHOW_CONTRACT_DETAILS && (
          <div className="soft-panel nested-panel">
            <h3>Contract targets</h3>
            <Fact
              label="ParticipationGateV2"
              value={shortHash(contracts?.participationGateAddress)}
            />
            <Fact
              label="DScopeCore"
              value={shortHash(contracts?.dscopeCoreAddress)}
            />
            {participationPlan?.contractCall && (
              <>
                <Fact
                  label="Target"
                  value={shortHash(participationPlan.contractCall.target)}
                />
                <Fact
                  label="Method"
                  value={participationPlan.contractCall.method}
                />
                <Fact
                  label="Survey key"
                  value={participationPlan.contractCall.args.surveyKey}
                />
                <Fact
                  label="Policy hash"
                  value={shortHash(
                    participationPlan.contractCall.args.policyHash,
                  )}
                />
              </>
            )}
          </div>
        )}
      </div>
      <CredentialQueueNotice
        credentialIssue={credentialIssue}
        participationPlan={participationPlan}
        systemStatus={systemStatus}
      />
      <ParticipationPauseNotice pauseStatus={pauseStatus} />
      {!answersReady && (
        <p className="muted">
          {missingRequiredCount === 1
            ? "Answer the required question before recording participation."
            : `Answer ${missingRequiredCount} required questions before recording participation.`}
        </p>
      )}
      <button
        className="primary-btn"
        type="button"
        onClick={onSubmit}
        disabled={busy}
      >
        {busy
          ? "Submitting…"
          : alreadyParticipated
            ? "Already participated"
            : participationPaused
              ? "Participation paused"
              : !answersReady
                ? "Answer required questions first"
                : walletReady
                  ? "Confirm with wallet"
                  : "Waiting for eligibility credential"}
      </button>
    </div>
  );
}

function ConfirmationPanel({
  participantView,
  onResults,
}: {
  participantView: ParticipantViewResponse | null;
  onResults: () => void;
}) {
  return (
    <div className="content-stack">
      <div className="success-panel">
        <h1>Participation recorded.</h1>
        <p>
          Your response was submitted. Results will be shown only in aggregate
          after the campaign is finalized.
        </p>
      </div>
      <div className="metric-grid three">
        <Metric
          label="Participation"
          value={participantView?.participant.participationStatus ?? "recorded"}
        />
        <Metric
          label="Results"
          value={
            participantView?.availability.canViewResults
              ? "available"
              : "after finalization"
          }
        />
        <Metric label="Privacy" value="aggregate results" />
      </div>
      <div className="action-row">
        <button className="primary-btn" type="button" onClick={onResults}>
          Open results
        </button>
      </div>
    </div>
  );
}
