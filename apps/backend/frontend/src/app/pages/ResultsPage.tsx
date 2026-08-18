import type { Screen, Survey } from "../model";
import { canViewSurveyResults, shortHash, surveyStatusLabel } from "../model";
import { Fact, Metric } from "../components/Primitives";

const MIN_TOTAL_SAMPLE = 10;
const MIN_SEGMENT_SAMPLE = 5;

type QuestionChoiceResult = {
  value: string;
  label: string;
  count: number;
  percentage?: number;
  suppressed?: boolean;
};

type QuestionResult = {
  questionId: string;
  title: string;
  type?: string;
  totalSelections?: number;
  choices?: QuestionChoiceResult[];
  privacy?: {
    suppressedChoices?: string[];
  };
};

type AnalyticsPayload = {
  totalRecords?: number;
  totalValidParticipants?: number;
  questionResults?: QuestionResult[];
  answerTotals?: Record<string, Record<string, number>>;
  byCountry?: Record<string, number>;
  byRegion?: Record<string, number>;
  byAgeBucket?: Record<string, number>;
  privacy?: {
    minTotalSample?: number;
    minSegmentSample?: number;
    flags?: {
      totalSampleTooSmall?: boolean;
      suppressedAgeBuckets?: string[];
      suppressedCountries?: string[];
      suppressedRegions?: string[];
    };
  };
};

export function ResultsPage({
  survey,
  setScreen,
  onRefresh,
}: {
  survey: Survey;
  setScreen: (screen: Screen) => void;
  onRefresh: () => void;
}) {
  const detail = survey.detail;
  const effectiveStatus =
    survey.effectiveStatus ||
    survey.lifecycle?.effectiveStatus ||
    survey.status;
  const finalizationFailed = effectiveStatus === "finalization_failed";
  const finalizationQueued = effectiveStatus === "ended";
  const finalizationRunning = effectiveStatus === "finalizing";
  const analytics = (detail?.result?.analyticsPayload ??
    {}) as AnalyticsPayload;

  /*
   * Frontend safety floor:
   * older finalized MVP snapshots may still contain 1 / 1 thresholds.
   * Never display them below the current product minimums.
   */
  const minTotalSample = Math.max(
    MIN_TOTAL_SAMPLE,
    safePositiveInteger(analytics.privacy?.minTotalSample, MIN_TOTAL_SAMPLE),
  );
  const minSegmentSample = Math.max(
    MIN_SEGMENT_SAMPLE,
    safePositiveInteger(
      analytics.privacy?.minSegmentSample,
      MIN_SEGMENT_SAMPLE,
    ),
  );
  const totalParticipants = safeNonNegativeInteger(
    analytics.totalValidParticipants ??
      detail?.result?.finalParticipantCount ??
      survey.finalParticipantCount ??
      0,
  );
  const totalSampleTooSmall =
    Boolean(analytics.privacy?.flags?.totalSampleTooSmall) ||
    (totalParticipants > 0 && totalParticipants < minTotalSample);

  const questionResults = totalSampleTooSmall
    ? []
    : applyQuestionPrivacyFloor(
        normalizeQuestionResults(analytics, survey),
        minSegmentSample,
      );
  const byCountry = totalSampleTooSmall
    ? {}
    : applyMapPrivacyFloor(analytics.byCountry ?? {}, minSegmentSample);
  const byRegion = totalSampleTooSmall
    ? {}
    : applyMapPrivacyFloor(analytics.byRegion ?? {}, minSegmentSample);
  const byAgeBucket = totalSampleTooSmall
    ? {}
    : applyMapPrivacyFloor(analytics.byAgeBucket ?? {}, minSegmentSample);

  if (!canViewSurveyResults(survey)) {
    return (
      <section className="screen-stack">
        <div className="card main-panel workspace-empty">
          <div>
            <div className="eyebrow">Results locked</div>
            <h1>
              {finalizationFailed
                ? "Finalization failed."
                : finalizationRunning
                  ? "Results are being prepared."
                  : finalizationQueued
                    ? "Results are queued for finalization."
                    : "Results are available only after finalization."}
            </h1>
            <p>
              {finalizationFailed
                ? "Results are not available because the finalization job failed. Retry finalization from Creator Studio; D-Scope keeps interim analytics locked until a successful finalization."
                : finalizationRunning
                  ? "D-Scope runner is preparing aggregate results. Interim analytics remain locked until finalization succeeds and privacy thresholds are applied."
                  : finalizationQueued
                    ? "The survey has ended. D-Scope runner will automatically start finalization; no creator action is required."
                    : "D-Scope does not show interim analytics while a survey is active or waiting for finalization. Aggregate results become visible only after backend finalization and privacy thresholds are applied."}
            </p>
            <p className="muted small-note">
              Current status: {surveyStatusLabel(survey, { creator: true })}
            </p>
          </div>
          <div className="action-row">
            <button className="secondary-btn" type="button" onClick={onRefresh}>
              Refresh status
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => setScreen("explore")}
            >
              Explore
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack analytics-screen">
      <div className="section-head analytics-page-head">
        <div>
          <div className="eyebrow">Finalized research analytics</div>
          <h1>Results</h1>
          <p>
            Final answer distributions and verified audience context, released
            only after finalization and privacy checks.
          </p>
        </div>
        <div className="action-row">
          <button className="secondary-btn" type="button" onClick={onRefresh}>
            Refresh
          </button>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => setScreen("explore")}
          >
            Explore
          </button>
        </div>
      </div>

      <div className="metric-grid four analytics-metric-grid">
        <Metric label="Final participants" value={totalParticipants} />
        <Metric
          label="Questions"
          value={String(questionResults.length || survey.questionsCount)}
        />
        <Metric
          label="Result hash"
          value={shortHash(detail?.result?.resultHash)}
        />
        <Metric
          label="Distribution hash"
          value={shortHash(detail?.result?.distributionHash)}
        />
      </div>

      {totalSampleTooSmall ? (
        <div className="privacy-lock-banner" role="status">
          <div className="privacy-lock-icon" aria-hidden="true">
            N≥{minTotalSample}
          </div>
          <div>
            <strong>Analytics hidden to protect a small sample</strong>
            <p>
              This campaign finalized with {totalParticipants} valid participant
              {totalParticipants === 1 ? "" : "s"}. At least {minTotalSample}{" "}
              are required before answer and audience aggregates can be
              published.
            </p>
          </div>
        </div>
      ) : null}

      <div className="product-analytics-layout">
        <div className="card panel results-primary-panel analytics-questions-panel">
          <div className="section-head compact analytics-section-title">
            <div>
              <span className="analytics-section-index">01</span>
              <h2>Question results</h2>
              <p>
                Finalized answer distributions. Individual response records are
                not displayed in this analytics view.
              </p>
            </div>
          </div>

          {totalSampleTooSmall ? (
            <AnalyticsEmptyState
              title="Question results are private"
              text={`The total sample has not reached the minimum publication threshold of ${minTotalSample}.`}
            />
          ) : questionResults.length === 0 ? (
            <AnalyticsEmptyState
              title="No publishable answer aggregates"
              text="The campaign had no finalized responses, or all available answer groups were suppressed by privacy rules."
            />
          ) : (
            <div className="question-results-stack">
              {questionResults.map((question, index) => (
                <QuestionResultsCard
                  key={question.questionId || index}
                  question={question}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="analytics-context-column">
          <div className="card panel audience-context-panel">
            <div className="analytics-section-title compact-title">
              <div>
                <span className="analytics-section-index">02</span>
                <h2>Verified audience context</h2>
                <p>
                  Compact predicate-backed breakdowns for the finalized sample.
                </p>
              </div>
            </div>

            <div className="predicate-card-grid">
              <PredicateCard
                title="Age"
                subtitle="Verified age buckets"
                rows={rowsFromMap(byAgeBucket)}
                empty={totalSampleTooSmall}
              />
              <PredicateCard
                title="Country"
                subtitle="Verified country buckets"
                rows={rowsFromMap(byCountry)}
                empty={totalSampleTooSmall}
              />
              <PredicateCard
                title="Region"
                subtitle="Derived regional groups"
                rows={rowsFromMap(byRegion)}
                empty={totalSampleTooSmall}
              />
            </div>
          </div>

          <div className="analytics-utility-grid">
            <div className="card panel compact-analytics-card privacy-settings-card">
              <div className="compact-card-head">
                <div>
                  <span className="analytics-section-index">03</span>
                  <h2>Privacy controls</h2>
                </div>
                <span className="privacy-active-badge">Enforced</span>
              </div>
              <p className="muted small-note">
                Segments below the publication threshold are hidden or grouped
                to reduce disclosure risk for small cohorts.
              </p>
              <div className="privacy-fact-grid">
                <Fact label="Minimum total sample" value={minTotalSample} />
                <Fact label="Minimum segment sample" value={minSegmentSample} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AnalyticsEmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="analytics-empty-state">
      <span aria-hidden="true">∿</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function QuestionResultsCard({
  question,
  index,
}: {
  question: QuestionResult;
  index: number;
}) {
  const choices = question.choices ?? [];
  const max = Math.max(1, ...choices.map((choice) => choice.count));

  return (
    <article className="result-question-card">
      <div className="result-question-head">
        <div className="question-number">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="result-question-copy">
          <h3>{question.title || question.questionId || "Question"}</h3>
          <p className="muted small-note">
            {formatQuestionType(question.type)} ·{" "}
            {question.totalSelections ?? 0} finalized selections
          </p>
        </div>
      </div>
      {choices.length === 0 ? (
        <p className="muted small-note compact-empty-copy">
          No public aggregate data for this question.
        </p>
      ) : (
        <div className="chart-block answer-chart-block compact-answer-chart">
          {choices.map((choice) => (
            <div
              className={`bar-row answer-row${choice.suppressed ? " suppressed" : ""}`}
              key={`${question.questionId}:${choice.value}`}
            >
              <span title={choice.label}>{choice.label}</span>
              <div>
                <i
                  style={{
                    width: `${Math.max(4, (choice.count / max) * 100)}%`,
                  }}
                />
              </div>
              <strong>
                {choice.count}
                {typeof choice.percentage === "number"
                  ? ` · ${choice.percentage}%`
                  : ""}
              </strong>
            </div>
          ))}
        </div>
      )}
      {(question.privacy?.suppressedChoices?.length ?? 0) > 0 ? (
        <p className="privacy-inline-note">
          Some options were grouped by the privacy threshold.
        </p>
      ) : null}
    </article>
  );
}

function PredicateCard({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: Array<[string, number]>;
  empty: boolean;
}) {
  const visibleRows = rows.slice(0, 5);
  const max = Math.max(1, ...visibleRows.map(([, value]) => value));
  const total = rows.reduce((sum, [, value]) => sum + value, 0);

  return (
    <article className="predicate-mini-card">
      <div className="predicate-card-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <strong>{empty ? "—" : total}</strong>
      </div>

      {empty || visibleRows.length === 0 ? (
        <div className="predicate-empty">Hidden by privacy controls</div>
      ) : (
        <div className="predicate-mini-chart">
          {visibleRows.map(([label, value]) => (
            <div className="predicate-mini-row" key={label}>
              <span title={formatBucketLabel(label)}>
                {formatBucketLabel(label)}
              </span>
              <div>
                <i style={{ width: `${Math.max(6, (value / max) * 100)}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
          {rows.length > visibleRows.length ? (
            <p className="predicate-more">
              +{rows.length - visibleRows.length} more segments
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function normalizeQuestionResults(
  analytics: AnalyticsPayload,
  survey: Survey,
): QuestionResult[] {
  if (Array.isArray(analytics.questionResults)) {
    return analytics.questionResults;
  }

  const answerTotals = analytics.answerTotals ?? {};
  const questions = survey.detail?.metadata?.questions ?? [];

  return Object.entries(answerTotals).map(([questionId, totals]) => {
    const question = questions.find((item) => item.id === questionId);
    const totalSelections = Object.values(totals).reduce(
      (sum, value) => sum + value,
      0,
    );

    return {
      questionId,
      title: question?.title ?? questionId,
      type: question?.type ?? "unknown",
      totalSelections,
      choices: Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({
          value,
          label: value,
          count,
          percentage:
            totalSelections > 0
              ? Math.round((count / totalSelections) * 1000) / 10
              : 0,
          suppressed: value === "OTHER_SUPPRESSED",
        })),
    };
  });
}

function applyQuestionPrivacyFloor(
  questions: QuestionResult[],
  minSegmentSample: number,
): QuestionResult[] {
  return questions.map((question) => {
    const choices = question.choices ?? [];
    const alreadySuppressed = choices.filter(
      (choice) => choice.suppressed || choice.value === "OTHER_SUPPRESSED",
    );
    const visibleChoices = choices.filter(
      (choice) =>
        !choice.suppressed &&
        choice.value !== "OTHER_SUPPRESSED" &&
        choice.count >= minSegmentSample,
    );
    const newlySuppressed = choices.filter(
      (choice) =>
        !choice.suppressed &&
        choice.value !== "OTHER_SUPPRESSED" &&
        choice.count > 0 &&
        choice.count < minSegmentSample,
    );
    const suppressedCount = [...alreadySuppressed, ...newlySuppressed].reduce(
      (sum, choice) => sum + choice.count,
      0,
    );
    const totalSelections = Math.max(
      question.totalSelections ?? 0,
      visibleChoices.reduce((sum, choice) => sum + choice.count, 0) +
        suppressedCount,
    );
    const safeChoices = [
      ...visibleChoices,
      ...(suppressedCount > 0
        ? [
            {
              value: "OTHER_SUPPRESSED",
              label: "Hidden by privacy threshold",
              count: suppressedCount,
              percentage:
                totalSelections > 0
                  ? Math.round((suppressedCount / totalSelections) * 1000) / 10
                  : 0,
              suppressed: true,
            },
          ]
        : []),
    ].map((choice) => ({
      ...choice,
      percentage:
        totalSelections > 0
          ? Math.round((choice.count / totalSelections) * 1000) / 10
          : 0,
    }));

    return {
      ...question,
      totalSelections,
      choices: safeChoices,
      privacy: {
        ...question.privacy,
        suppressedChoices: [
          ...(question.privacy?.suppressedChoices ?? []),
          ...newlySuppressed.map((choice) => choice.value),
        ],
      },
    };
  });
}

function applyMapPrivacyFloor(
  map: Record<string, number>,
  minSegmentSample: number,
): Record<string, number> {
  const visible: Record<string, number> = {};
  let suppressedTotal = 0;

  for (const [key, rawValue] of Object.entries(map)) {
    const value = safeNonNegativeInteger(rawValue);

    if (key === "OTHER_SUPPRESSED") {
      suppressedTotal += value;
    } else if (value > 0 && value < minSegmentSample) {
      suppressedTotal += value;
    } else if (value > 0) {
      visible[key] = value;
    }
  }

  if (suppressedTotal > 0) {
    visible.OTHER_SUPPRESSED = suppressedTotal;
  }

  return visible;
}

function rowsFromMap(map: Record<string, number>): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function safePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.floor(numeric)
    : fallback;
}

function safeNonNegativeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function formatBucketLabel(value: string): string {
  if (value === "OTHER_SUPPRESSED") return "Hidden segments";
  if (value === "OTHER_UNKNOWN") return "Other / unknown";
  if (value === "61_PLUS") return "61+";
  if (/^\d+_\d+$/.test(value)) return value.replace("_", "–");
  return value.replaceAll("_", " ");
}

function formatQuestionType(type: string | undefined): string {
  switch (type) {
    case "single_choice":
      return "Single choice";
    case "multiple_choice":
      return "Multiple choice";
    case "short_text":
      return "Short text";
    default:
      return "Question";
  }
}
