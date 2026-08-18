import { useMemo, useState } from "react";
import type { Screen, Survey } from "../model";
import {
  badgeTone,
  canParticipateInSurvey,
  effectiveSurveyStatus,
  formatTimeRemaining,
  surveyStatusLabel,
} from "../model";
import { Fact } from "../components/Primitives";

type SurveyFilter = "active" | "ended" | "finalized" | "all";

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

function isPublicSurvey(survey: Survey): boolean {
  return ["active", "ended", "finalizing", "finalized"].includes(
    effectiveSurveyStatus(survey),
  );
}

export function ExplorePage({
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
  const [filter, setFilter] = useState<SurveyFilter>("active");
  const [query, setQuery] = useState("");

  const publicSurveys = useMemo(
    () => surveys.filter(isPublicSurvey),
    [surveys],
  );

  const counts = useMemo(
    () => ({
      active: publicSurveys.filter((survey) => canParticipateInSurvey(survey))
        .length,
      ended: publicSurveys.filter(
        (survey) => effectiveSurveyStatus(survey) === "ended",
      ).length,
      finalized: publicSurveys.filter(
        (survey) => effectiveSurveyStatus(survey) === "finalized",
      ).length,
      all: publicSurveys.length,
    }),
    [publicSurveys],
  );

  const visibleSurveys = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return publicSurveys.filter((survey) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && canParticipateInSurvey(survey)) ||
        (filter === "ended" && effectiveSurveyStatus(survey) === "ended") ||
        (filter === "finalized" &&
          effectiveSurveyStatus(survey) === "finalized");

      const matchesQuery =
        !normalizedQuery ||
        survey.title.toLowerCase().includes(normalizedQuery) ||
        survey.description.toLowerCase().includes(normalizedQuery) ||
        survey.creatorName.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filter, query, publicSurveys]);

  return (
    <section className="screen-stack public-explore-screen">
      <div className="catalog-header card visual-header public-catalog-header">
        <div>
          <div className="eyebrow">Survey discovery</div>
          <h1>Explore surveys</h1>
          <p>
            Browse public campaigns, check requirements, and open finalized
            aggregate analytics.
          </p>
        </div>
        <div className="catalog-actions">
          <button className="secondary-btn" type="button" onClick={onRefresh}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="catalog-controls card compact-catalog-controls">
        <div className="filter-tabs" role="tablist" aria-label="Survey filters">
          <button
            type="button"
            className={filter === "active" ? "active" : ""}
            onClick={() => setFilter("active")}
          >
            Active <span>{counts.active}</span>
          </button>
          <button
            type="button"
            className={filter === "ended" ? "active" : ""}
            onClick={() => setFilter("ended")}
          >
            Ended <span>{counts.ended}</span>
          </button>
          <button
            type="button"
            className={filter === "finalized" ? "active" : ""}
            onClick={() => setFilter("finalized")}
          >
            Finalized <span>{counts.finalized}</span>
          </button>
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All <span>{counts.all}</span>
          </button>
        </div>
        <label className="catalog-search">
          <span className="sr-only">Search surveys</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search survey, creator, topic…"
          />
        </label>
      </div>

      {loading && visibleSurveys.length === 0 ? (
        <div className="catalog-list">
          <div className="card catalog-row skeleton-card" />
          <div className="card catalog-row skeleton-card" />
          <div className="card catalog-row skeleton-card" />
        </div>
      ) : visibleSurveys.length > 0 ? (
        <div className="catalog-list public-catalog-list">
          {visibleSurveys.map((survey) => (
            <CatalogSurveyRow
              key={survey.id}
              survey={survey}
              onOpen={() => onOpenSurvey(survey)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-card card">
          <h3>No surveys match this view</h3>
          <p>
            Try switching the filter, clearing search, refreshing backend data,
            or opening Creator Studio.
          </p>
          <div className="action-row">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setFilter("all")}
            >
              Show all
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => setScreen("creatorAccess")}
            >
              Creator Studio
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CatalogSurveyRow({
  survey,
  onOpen,
}: {
  survey: Survey;
  onOpen: () => void;
}) {
  const canParticipate = canParticipateInSurvey(survey);

  return (
    <article className="card catalog-row public-catalog-row">
      <div className="creator-mark">
        {survey.creatorName.slice(0, 1).toUpperCase()}
      </div>
      <div className="catalog-main">
        <div className="catalog-title-row">
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
        <div className="catalog-signal-line">
          <span>{surveyReadinessLabel(survey)}</span>
          <strong>{survey.participants} responses</strong>
        </div>
        <div
          className="progress-track catalog-progress"
          aria-label="Sample progress"
        >
          <span style={{ width: `${surveySampleProgress(survey)}%` }} />
        </div>
        <div className="catalog-facts compact-facts public-card-facts">
          <Fact label="Questions" value={String(survey.questionsCount)} />
          <Fact label="Access" value="Verified eligibility" />
          <Fact
            label="Time left"
            value={
              canParticipate
                ? formatTimeRemaining(survey.schedule?.timeRemainingSeconds)
                : surveyStatusLabel(survey)
            }
          />
        </div>
      </div>
      <div className="catalog-side">
        <button
          className={canParticipate ? "primary-btn" : "secondary-btn"}
          type="button"
          onClick={onOpen}
        >
          {canParticipate
            ? "Open survey"
            : effectiveSurveyStatus(survey) === "finalized"
              ? "View results"
              : "View status"}
        </button>
      </div>
    </article>
  );
}
