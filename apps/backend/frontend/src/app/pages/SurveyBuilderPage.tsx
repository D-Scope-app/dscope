import { useMemo, useState } from "react";
import { createMvpSurvey } from "../api";
import type {
  CreateMvpSurveyBody,
  QuestionType,
  SurveyDurationPreset,
  SurveyQuestion,
} from "../types";
import type { BuilderStep, CreatorProfile, Survey } from "../model";
import {
  AGE_BUCKETS,
  COUNTRIES,
  REGIONS,
  surveyFromSummary,
  uniqueSurveyKey,
} from "../model";
import { Fact } from "../components/Primitives";
import { PUBLIC_ENABLE_DEV_MODE } from "../publicConfig";

type PredicateGroup = "age" | "country" | "region";
type BuilderQuestionType = Extract<
  QuestionType,
  "single_choice" | "multiple_choice"
>;

const ZKPASSPORT_REGISTRY_URL = "https://registry.zkpassport.id/";

const ALL_SURVEY_DURATION_OPTIONS: Array<{
  value: SurveyDurationPreset;
  label: string;
  description: string;
}> = [
  { value: "1h", label: "1 hour", description: "Debug / smoke test window" },
  { value: "24h", label: "24 hours", description: "Short public campaign" },
  { value: "3d", label: "3 days", description: "Fast feedback cycle" },
  { value: "7d", label: "7 days", description: "Default campaign window" },
  { value: "14d", label: "14 days", description: "Broader collection window" },
  { value: "30d", label: "30 days", description: "Maximum public MVP window" },
  { value: "15m_test", label: "15 minutes", description: "Dev/test mode only" },
];

const SURVEY_DURATION_OPTIONS = ALL_SURVEY_DURATION_OPTIONS.filter(
  (item) => PUBLIC_ENABLE_DEV_MODE || item.value !== "15m_test",
);

function durationLabel(value: SurveyDurationPreset) {
  return (
    ALL_SURVEY_DURATION_OPTIONS.find((item) => item.value === value)?.label ??
    value
  );
}

function newQuestion(index: number): SurveyQuestion {
  return {
    id: `q_${index}`,
    type: "single_choice",
    title: "",
    required: true,
    options: ["", ""],
  };
}

function normalizeOptions(options: string[] | undefined) {
  return (options ?? []).map((option) => option.trim()).filter(Boolean);
}

function normalizeQuestionsForSubmit(questions: SurveyQuestion[]) {
  return questions.map((question, index) => ({
    id: question.id || `q_${index + 1}`,
    type:
      question.type === "multiple_choice" ? "multiple_choice" : "single_choice",
    title: question.title.trim(),
    required: question.required !== false,
    options: normalizeOptions(question.options),
  }));
}

function selectionMode(selected: string[], allValues: string[]) {
  if (selected.length === 0 || selected.length === allValues.length) {
    return { mode: "any" as const, values: [] };
  }

  return { mode: "allow_list" as const, values: selected };
}

export function SurveyBuilder({
  creator,
  onCreated,
  setMessage,
}: {
  creator: CreatorProfile | null;
  onCreated: (survey: Survey) => void;
  setMessage: (message: string | null) => void;
}) {
  const [step, setStep] = useState<BuilderStep>("content");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<SurveyQuestion[]>([
    newQuestion(1),
  ]);
  const [ageBuckets, setAgeBuckets] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [durationPreset, setDurationPreset] =
    useState<SurveyDurationPreset>("1h");
  const [busy, setBusy] = useState(false);

  const activeStepIndex = useMemo(
    () =>
      (
        ["content", "eligibility", "rewards", "review"] as BuilderStep[]
      ).indexOf(step),
    [step],
  );

  function goToStep(nextStep: BuilderStep) {
    setMessage(null);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggle(value: string, group: PredicateGroup) {
    const setter =
      group === "age"
        ? setAgeBuckets
        : group === "country"
          ? setCountries
          : setRegions;
    setter((items) =>
      items.includes(value)
        ? items.filter((item) => item !== value)
        : [...items, value],
    );
  }

  function setAll(group: PredicateGroup, selected: boolean) {
    if (group === "age") setAgeBuckets(selected ? [...AGE_BUCKETS] : []);
    if (group === "country") setCountries(selected ? [...COUNTRIES] : []);
    if (group === "region") setRegions(selected ? [...REGIONS] : []);
  }

  function updateQuestion(id: string, patch: Partial<SurveyQuestion>) {
    setQuestions((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function changeQuestionType(id: string, type: BuilderQuestionType) {
    setQuestions((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              type,
              options:
                item.options && item.options.length >= 2
                  ? item.options
                  : ["", ""],
            }
          : item,
      ),
    );
  }

  function addQuestion() {
    setQuestions((items) => [...items, newQuestion(items.length + 1)]);
  }

  function removeQuestion(id: string) {
    setQuestions((items) =>
      items.length <= 1
        ? items
        : items
            .filter((item) => item.id !== id)
            .map((item, index) => ({ ...item, id: `q_${index + 1}` })),
    );
  }

  function updateOption(
    questionId: string,
    optionIndex: number,
    value: string,
  ) {
    setQuestions((items) =>
      items.map((item) =>
        item.id === questionId
          ? {
              ...item,
              options: (item.options ?? ["", ""]).map((option, index) =>
                index === optionIndex ? value : option,
              ),
            }
          : item,
      ),
    );
  }

  function addOption(questionId: string) {
    updateQuestion(questionId, {
      options: [
        ...(questions.find((item) => item.id === questionId)?.options ?? []),
        "",
      ],
    });
  }

  function removeOption(questionId: string, optionIndex: number) {
    setQuestions((items) =>
      items.map((item) => {
        if (item.id !== questionId) return item;
        const options = item.options ?? [];
        if (options.length <= 2) return item;
        return {
          ...item,
          options: options.filter((_, index) => index !== optionIndex),
        };
      }),
    );
  }

  async function createSurvey() {
    const normalizedQuestions = normalizeQuestionsForSubmit(questions);

    if (!title.trim()) {
      setMessage("Add a survey title before creating the campaign.");
      goToStep("content");
      return;
    }

    const invalidQuestionIndex = normalizedQuestions.findIndex(
      (question) => !question.title,
    );
    if (invalidQuestionIndex >= 0) {
      setMessage(`Question ${invalidQuestionIndex + 1} needs a title.`);
      goToStep("content");
      return;
    }

    const invalidOptionsIndex = normalizedQuestions.findIndex(
      (question) => question.options.length < 2,
    );
    if (invalidOptionsIndex >= 0) {
      setMessage(
        `Question ${invalidOptionsIndex + 1} needs at least two answer options.`,
      );
      goToStep("content");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const key = uniqueSurveyKey();
      const ageSelection = selectionMode(ageBuckets, AGE_BUCKETS);
      const countrySelection = selectionMode(countries, COUNTRIES);
      const regionSelection = selectionMode(regions, REGIONS);
      const body: CreateMvpSurveyBody = {
        surveyId: `survey_frontend_${key}`,
        surveyKey: key,
        sponsor: creator?.email || creator?.organization || "D-Scope Creator",
        creatorWorkspaceId: creator?.workspaceId ?? null,
        creatorDisplayName: creator?.organization || "D-Scope Creator",
        operatorAddress: "accounts:test0",
        createdByOperator: true,
        title: title.trim(),
        description: description.trim(),
        questions: normalizedQuestions,
        predicatePolicyHash: "777",
        predicatePolicyJson: {
          version: 1,
          predicateSource: "zkpassport",
          age:
            ageSelection.mode === "allow_list"
              ? { mode: "bucket_in", min: null, buckets: ageSelection.values }
              : { mode: "any", min: null, buckets: [] },
          countries: countrySelection,
          regions: regionSelection,
          freshness: { mode: "any", days: null },
        },
        rewardEnabled: false,
        rewardPoolAmount: "0",
        claimDeadline: "0",
        durationPreset,
        testMode: durationPreset === "15m_test",
        analyticsMinTotalSample: "10",
        analyticsMinSegmentSample: "5",
      };
      const response = await createMvpSurvey(body);
      onCreated(
        surveyFromSummary({
          id: response.survey.id,
          surveyKey: response.survey.surveyKey,
          sponsor: response.survey.sponsor,
          creator: response.survey.creator,
          title: response.survey.title,
          description: response.survey.metadata.description,
          status: response.survey.status,
          metadataHash: response.survey.metadataHash,
          predicatePolicyHash: response.survey.predicatePolicyHash,
          questionsCount: response.survey.metadata.questions.length,
          reward: {
            rewardEnabled: response.survey.reward.rewardEnabled,
            rewardPoolAmount: response.survey.reward.rewardPoolAmount,
            claimDeadline: response.survey.reward.claimDeadline,
            rewardStatus: "PENDING_CONFIG",
          },
          eligibilitySummary: {
            mode: "policy_hash_available",
            policyHash: response.survey.predicatePolicyHash,
          },
          participantCount: 0,
          finalParticipantCount: null,
          createdAt: response.survey.createdAt,
          updatedAt: response.survey.updatedAt,
        }),
      );
      setMessage(
        "Survey created. It will appear in Creator Studio while deployment is processed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Survey creation failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="builder-layout public-builder-layout">
      <aside className="card side-panel builder-side-panel">
        <div className="eyebrow">Creator flow</div>
        <h2>Campaign builder</h2>
        <p className="muted">
          Create a privacy-aware research campaign. D-Scope runner handles
          deployment and finalization for this MVP.
        </p>
        <div className="step-list">
          {(
            ["content", "eligibility", "rewards", "review"] as BuilderStep[]
          ).map((item, index) => (
            <button
              key={item}
              className={step === item ? "active" : ""}
              type="button"
              onClick={() => goToStep(item)}
            >
              <span>{index + 1}</span>
              {builderLabel(item)}
            </button>
          ))}
        </div>
        <p className="builder-progress-note">Step {activeStepIndex + 1} of 4</p>
      </aside>
      <div className="card main-panel builder-main-panel">
        {step === "content" && (
          <BuilderContent
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            questions={questions}
            updateQuestion={updateQuestion}
            changeQuestionType={changeQuestionType}
            addQuestion={addQuestion}
            removeQuestion={removeQuestion}
            updateOption={updateOption}
            addOption={addOption}
            removeOption={removeOption}
            onNext={() => goToStep("eligibility")}
          />
        )}
        {step === "eligibility" && (
          <BuilderEligibility
            ageBuckets={ageBuckets}
            countries={countries}
            regions={regions}
            toggle={toggle}
            setAll={setAll}
            onBack={() => goToStep("content")}
            onNext={() => goToStep("rewards")}
          />
        )}
        {step === "rewards" && (
          <BuilderTiming
            durationPreset={durationPreset}
            setDurationPreset={setDurationPreset}
            onBack={() => goToStep("eligibility")}
            onNext={() => goToStep("review")}
          />
        )}
        {step === "review" && (
          <BuilderReview
            title={title}
            description={description}
            questions={questions}
            ageBuckets={ageBuckets}
            countries={countries}
            regions={regions}
            durationPreset={durationPreset}
            busy={busy}
            onBack={() => goToStep("rewards")}
            onCreate={createSurvey}
          />
        )}
      </div>
    </section>
  );
}

function builderLabel(step: BuilderStep) {
  if (step === "content") return "Content";
  if (step === "eligibility") return "Eligibility";
  if (step === "rewards") return "Timing";
  return "Review";
}

function BuilderContent({
  title,
  setTitle,
  description,
  setDescription,
  questions,
  updateQuestion,
  changeQuestionType,
  addQuestion,
  removeQuestion,
  updateOption,
  addOption,
  removeOption,
  onNext,
}: {
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  questions: SurveyQuestion[];
  updateQuestion: (id: string, patch: Partial<SurveyQuestion>) => void;
  changeQuestionType: (id: string, type: BuilderQuestionType) => void;
  addQuestion: () => void;
  removeQuestion: (id: string) => void;
  updateOption: (
    questionId: string,
    optionIndex: number,
    value: string,
  ) => void;
  addOption: (questionId: string) => void;
  removeOption: (questionId: string, optionIndex: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="content-stack builder-content-stack">
      <div className="page-title compact builder-page-title">
        <span>Step 1</span>
        <h1>Survey content</h1>
        <p>
          Add the questions respondents will answer. For the MVP, D-Scope
          supports single-choice and multiple-choice questions.
        </p>
      </div>
      <div className="builder-form-section">
        <label>
          <span>Title</span>
          <input
            value={title}
            placeholder="Survey title"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={description}
            placeholder="Short description for respondents"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>
      <div className="question-list builder-question-list">
        {questions.map((question, questionIndex) => (
          <div
            className="question-card builder-question-card"
            key={question.id}
          >
            <div className="builder-question-topline">
              <div>
                <span className="question-number">{questionIndex + 1}</span>
                <strong>Question {questionIndex + 1}</strong>
              </div>
              <button
                className="icon-danger-btn"
                type="button"
                onClick={() => removeQuestion(question.id)}
                disabled={questions.length <= 1}
                aria-label={`Remove question ${questionIndex + 1}`}
                title="Remove question"
              >
                ×
              </button>
            </div>
            <div className="builder-question-grid">
              <label className="builder-type-control">
                <span>Type</span>
                <select
                  value={
                    question.type === "multiple_choice"
                      ? "multiple_choice"
                      : "single_choice"
                  }
                  onChange={(event) =>
                    changeQuestionType(
                      question.id,
                      event.target.value as BuilderQuestionType,
                    )
                  }
                >
                  <option value="single_choice">Single choice</option>
                  <option value="multiple_choice">Multiple choice</option>
                </select>
              </label>
              <label>
                <span>Question</span>
                <input
                  value={question.title}
                  placeholder="Question text"
                  onChange={(event) =>
                    updateQuestion(question.id, { title: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="required-toggle">
              <input
                type="checkbox"
                checked={question.required !== false}
                onChange={(event) =>
                  updateQuestion(question.id, {
                    required: event.target.checked,
                  })
                }
              />
              <span>Required question</span>
            </label>
            <div className="builder-option-list">
              {(question.options ?? []).map((option, index) => (
                <div
                  className="builder-option-row"
                  key={`${question.id}_${index}`}
                >
                  <input
                    value={option}
                    placeholder={`Answer ${index + 1}`}
                    onChange={(event) =>
                      updateOption(question.id, index, event.target.value)
                    }
                  />
                  <button
                    className="icon-ghost-btn"
                    type="button"
                    onClick={() => removeOption(question.id, index)}
                    disabled={(question.options ?? []).length <= 2}
                    aria-label={`Remove answer ${index + 1}`}
                    title="Remove answer option"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="ghost-btn builder-add-option"
                type="button"
                onClick={() => addOption(question.id)}
              >
                Add answer option
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="builder-footer-actions">
        <button className="secondary-btn" type="button" onClick={addQuestion}>
          Add question
        </button>
        <button className="primary-btn" type="button" onClick={onNext}>
          Continue to eligibility
        </button>
      </div>
    </div>
  );
}

function BuilderEligibility({
  ageBuckets,
  countries,
  regions,
  toggle,
  setAll,
  onBack,
  onNext,
}: {
  ageBuckets: string[];
  countries: string[];
  regions: string[];
  toggle: (value: string, group: PredicateGroup) => void;
  setAll: (group: PredicateGroup, selected: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="content-stack builder-content-stack">
      <div className="page-title compact builder-page-title">
        <span>Step 2</span>
        <h1>Eligibility</h1>
        <p>
          Choose who can participate. Leaving a predicate empty means this
          campaign accepts any value for that predicate.
        </p>
      </div>
      <div className="soft-panel verification-coverage-note">
        <div>
          <strong>Document coverage notice</strong>
          <p>
            Eligibility verification depends on supported NFC documents and
            countries. D-Scope will keep this visible before creators launch a
            campaign and before respondents start verification.
          </p>
        </div>
        <a href={ZKPASSPORT_REGISTRY_URL} target="_blank" rel="noreferrer">
          View zkPassport registry
        </a>
      </div>
      <PredicateSelector
        title="Age buckets"
        description="Select the age ranges allowed to participate."
        values={AGE_BUCKETS}
        selected={ageBuckets}
        group="age"
        labelForValue={formatAgeBucket}
        onToggle={toggle}
        onSetAll={setAll}
      />
      <PredicateSelector
        title="Countries"
        description="Select verified country predicates. Use the registry link above for provider coverage."
        values={COUNTRIES}
        selected={countries}
        group="country"
        labelForValue={formatCountryCode}
        onToggle={toggle}
        onSetAll={setAll}
      />
      <PredicateSelector
        title="Regions"
        description="Regions are used as derived analytics groupings."
        values={REGIONS}
        selected={regions}
        group="region"
        labelForValue={formatRegion}
        onToggle={toggle}
        onSetAll={setAll}
      />
      <div className="builder-footer-actions">
        <button className="secondary-btn" type="button" onClick={onBack}>
          Back
        </button>
        <button className="primary-btn" type="button" onClick={onNext}>
          Continue to timing
        </button>
      </div>
    </div>
  );
}

function PredicateSelector({
  title,
  description,
  values,
  selected,
  group,
  labelForValue,
  onToggle,
  onSetAll,
}: {
  title: string;
  description: string;
  values: string[];
  selected: string[];
  group: PredicateGroup;
  labelForValue: (value: string) => string;
  onToggle: (value: string, group: PredicateGroup) => void;
  onSetAll: (group: PredicateGroup, selected: boolean) => void;
}) {
  const allSelected = selected.length === values.length;
  const selectionLabel =
    selected.length === 0 ? "Any" : `${selected.length} selected`;

  return (
    <details className="predicate-panel" open={group !== "country"}>
      <summary>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <em>{allSelected ? "All selected" : selectionLabel}</em>
      </summary>
      <div className="predicate-actions">
        <button
          className="secondary-btn"
          type="button"
          onClick={() => onSetAll(group, !allSelected)}
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
        {selected.length > 0 && !allSelected && (
          <button
            className="ghost-btn"
            type="button"
            onClick={() => onSetAll(group, false)}
          >
            Clear selection
          </button>
        )}
      </div>
      <div className="predicate-checkbox-grid">
        {values.map((value) => (
          <label className="predicate-checkbox" key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value, group)}
            />
            <span>{labelForValue(value)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function BuilderTiming({
  durationPreset,
  setDurationPreset,
  onBack,
  onNext,
}: {
  durationPreset: SurveyDurationPreset;
  setDurationPreset: (value: SurveyDurationPreset) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="content-stack builder-content-stack">
      <div className="page-title compact builder-page-title">
        <span>Step 3</span>
        <h1>Timing</h1>
        <p>
          Choose how long the campaign remains open. Rewards are outside the
          scope of the first public release.
        </p>
      </div>
      <div className="soft-panel timing-note">
        <strong>No rewards in the first public release</strong>
        <p>
          This step only controls the survey window. New campaigns are created
          with reward fields locked to disabled and zero values.
        </p>
      </div>
      <div className="chip-group">
        <h3>Survey duration</h3>
        <div className="chip-grid duration-grid builder-duration-grid">
          {SURVEY_DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={durationPreset === option.value ? "selected" : ""}
              type="button"
              onClick={() => setDurationPreset(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="builder-footer-actions">
        <button className="secondary-btn" type="button" onClick={onBack}>
          Back
        </button>
        <button className="primary-btn" type="button" onClick={onNext}>
          Continue to review
        </button>
      </div>
    </div>
  );
}

function BuilderReview({
  title,
  description,
  questions,
  ageBuckets,
  countries,
  regions,
  durationPreset,
  busy,
  onBack,
  onCreate,
}: {
  title: string;
  description: string;
  questions: SurveyQuestion[];
  ageBuckets: string[];
  countries: string[];
  regions: string[];
  durationPreset: SurveyDurationPreset;
  busy: boolean;
  onBack: () => void;
  onCreate: () => void;
}) {
  const requiredCount = questions.filter(
    (question) => question.required !== false,
  ).length;
  const optionalCount = questions.length - requiredCount;

  return (
    <div className="content-stack builder-content-stack">
      <div className="page-title compact builder-page-title">
        <span>Step 4</span>
        <h1>Review</h1>
        <p>
          Review the campaign before D-Scope creates the backend survey and
          queues deployment with the runner.
        </p>
      </div>
      <div className="review-grid">
        <Fact label="Title" value={title || "Not set"} />
        <Fact label="Description" value={description || "Not set"} />
        <Fact label="Questions" value={String(questions.length)} />
        <Fact label="Optional questions" value={String(optionalCount)} />
        <Fact
          label="Age"
          value={formatSelection(ageBuckets, AGE_BUCKETS, formatAgeBucket)}
        />
        <Fact
          label="Countries"
          value={formatSelection(countries, COUNTRIES, formatCountryCode)}
        />
        <Fact
          label="Regions"
          value={formatSelection(regions, REGIONS, formatRegion)}
        />
        <Fact label="Duration" value={durationLabel(durationPreset)} />
      </div>
      <div className="builder-footer-actions">
        <button className="secondary-btn" type="button" onClick={onBack}>
          Back
        </button>
        <button
          className="primary-btn"
          type="button"
          onClick={onCreate}
          disabled={busy}
        >
          {busy ? "Creating…" : "Create survey"}
        </button>
      </div>
    </div>
  );
}

function formatSelection(
  selected: string[],
  allValues: string[],
  formatter: (value: string) => string,
) {
  if (selected.length === 0 || selected.length === allValues.length)
    return "Any";
  if (selected.length > 8) return `${selected.length} selected`;
  return selected.map(formatter).join(", ");
}

function formatAgeBucket(value: string) {
  return value
    .replace("_", "–")
    .replace("plus", "+")
    .replace("other–unknown", "Other");
}

function formatRegion(value: string) {
  return value.replaceAll("_", " ");
}

function formatCountryCode(value: string) {
  return value === "OTHER_UNKNOWN" ? "Other / unknown" : value;
}
