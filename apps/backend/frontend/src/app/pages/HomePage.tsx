import type { Screen, Survey } from "../model";
import {
  badgeTone,
  canParticipateInSurvey,
  effectiveSurveyStatus,
  formatTimeRemaining,
  surveyStatusLabel,
} from "../model";
import { Fact } from "../components/Primitives";

function surveySampleProgress(survey: Survey): number {
  if (effectiveSurveyStatus(survey) === "finalized") return 100;
  if (survey.participants <= 0) return 8;
  return Math.min(100, Math.max(12, survey.participants * 10));
}

function surveyReadinessLabel(survey: Survey): string {
  if (effectiveSurveyStatus(survey) === "finalized") return "Analytics ready";
  if (effectiveSurveyStatus(survey) === "finalizing")
    return "Preparing aggregate results";
  if (effectiveSurveyStatus(survey) === "ended")
    return "Ended · awaiting finalization";
  if (survey.participants <= 0) return "Waiting for first responses";
  return "Collecting verified responses";
}

export function HomePage({
  surveys,
  loading,
  onRefresh,
  onOpenSurvey,
  setScreen,
}: {
  surveys: Survey[];
  loading: boolean;
  onRefresh: () => void;
  onOpenSurvey: (survey: Survey) => void;
  setScreen: (screen: Screen) => void;
}) {
  const activeSurveys = surveys.filter((survey) =>
    canParticipateInSurvey(survey),
  );
  const featuredSurveys = activeSurveys.slice(0, 4);

  return (
    <section className="screen-stack home-screen">
      <div className="home-hero card visual-hero public-hero app-brand-hero">
        <div className="hero-orbit" aria-hidden="true" />
        <div className="brand-signal-beam" aria-hidden="true" />
        <div className="home-copy">
          <div className="eyebrow">D-Scope app</div>
          <h1>Private research for verified audiences.</h1>
          <p>
            Launch privacy-aware research campaigns with verified eligibility,
            one response per respondent, and aggregate insights after privacy
            checks.
          </p>
          <div className="action-row">
            <button
              className="primary-btn"
              type="button"
              onClick={() => setScreen("explore")}
            >
              Explore campaigns
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setScreen("creatorAccess")}
            >
              Create campaign
            </button>
          </div>
        </div>
        <div
          className="active-campaign-stat"
          aria-label={`${activeSurveys.length} active campaigns`}
        >
          <span>Active campaigns</span>
          <strong>{activeSurveys.length}</strong>
          <em>Live research campaigns ready for participation.</em>
        </div>
      </div>

      <div className="section-head tight-head public-section-head">
        <div>
          <div className="eyebrow">Live discovery</div>
          <h2>Active campaigns</h2>
          <p>Open research campaigns ready for eligible respondents.</p>
        </div>
        <div className="action-row">
          <button className="ghost-btn" type="button" onClick={onRefresh}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => setScreen("explore")}
          >
            Explorer
          </button>
        </div>
      </div>

      {loading && featuredSurveys.length === 0 ? (
        <div className="featured-grid">
          <div className="card survey-card skeleton-card" />
          <div className="card survey-card skeleton-card" />
          <div className="card survey-card skeleton-card" />
        </div>
      ) : featuredSurveys.length > 0 ? (
        <div className="featured-grid public-featured-grid">
          {featuredSurveys.map((survey) => (
            <FeaturedSurveyCard
              key={survey.id}
              survey={survey}
              onOpen={() => onOpenSurvey(survey)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-card card">
          <h3>No active campaigns yet</h3>
          <p>
            Published research campaigns will appear here after deployment and
            activation.
          </p>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => setScreen("creatorAccess")}
          >
            Open Creator Studio
          </button>
        </div>
      )}

      <div className="home-strip card value-strip public-value-strip">
        <div>
          <span className="strip-icon" aria-hidden="true">
            ◈
          </span>
          <strong>Verified requirements</strong>
          <span>
            Campaigns can require private eligibility checks before
            participation.
          </span>
        </div>
        <div>
          <span className="strip-icon" aria-hidden="true">
            ✓
          </span>
          <strong>Private participation</strong>
          <span>Respondents prove only what is needed for the campaign.</span>
        </div>
        <div>
          <span className="strip-icon" aria-hidden="true">
            ▣
          </span>
          <strong>Aggregate analytics</strong>
          <span>
            Results are shown as aggregate signals with privacy thresholds for
            small segments.
          </span>
        </div>
      </div>
    </section>
  );
}

function FeaturedSurveyCard({
  survey,
  onOpen,
}: {
  survey: Survey;
  onOpen: () => void;
}) {
  const progress = surveySampleProgress(survey);

  return (
    <article className="card survey-card featured-survey-card enhanced-survey-card public-survey-card">
      <div className="card-row align-start">
        <div className="creator-mark">
          {survey.creatorName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h3>{survey.title}</h3>
          <p>Created by {survey.creatorName}</p>
        </div>
        <span
          className={`pill pill-${badgeTone(effectiveSurveyStatus(survey))}`}
        >
          {surveyStatusLabel(survey)}
        </span>
      </div>
      <p className="muted">{survey.description}</p>
      <div className="survey-signal-row">
        <span>{surveyReadinessLabel(survey)}</span>
        <strong>{survey.participants} responses</strong>
      </div>
      <div className="progress-track" aria-label="Sample progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="facts-grid compact-facts public-card-facts">
        <Fact label="Questions" value={String(survey.questionsCount)} />
        <Fact label="Privacy" value="Thresholded aggregates" />
        <Fact
          label="Time left"
          value={
            canParticipateInSurvey(survey)
              ? formatTimeRemaining(survey.schedule?.timeRemainingSeconds)
              : surveyStatusLabel(survey)
          }
        />
      </div>
      <button className="secondary-btn full" type="button" onClick={onOpen}>
        Open survey
      </button>
    </article>
  );
}
