#!/usr/bin/env node

const API = process.env.API || process.env.BACKEND_URL || "https://app.dscope.app";
const TOKEN = process.env.TOKEN || process.env.INTERNAL_RUNNER_TOKEN;

if (!TOKEN) {
  console.warn("[auto-finalize] TOKEN/INTERNAL_RUNNER_TOKEN is not set; skipping");
  process.exit(0);
}

async function readJson(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { res, data, text };
}

function getSurveysFromList(data) {
  return data?.surveys || data?.data?.surveys || [];
}

function getJobs(detail) {
  return (
    detail?.runner?.jobs ||
    detail?.jobs ||
    detail?.data?.runner?.jobs ||
    []
  );
}

function getSurvey(detail, fallback) {
  return detail?.survey || detail?.data?.survey || fallback || {};
}

function getEndTime(survey) {
  const value =
    survey?.schedule?.endTime ??
    survey?.endTime ??
    survey?.end_time ??
    survey?.legacySchedule?.end_time ??
    null;

  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasFinalizeJob(jobs) {
  return jobs.some((job) => {
    return (
      job?.type === "finalize_survey_mvp" &&
      ["pending", "running", "done"].includes(String(job?.status || ""))
    );
  });
}

async function main() {
  const now = Math.floor(Date.now() / 1000);

  const list = await readJson("/mvp/surveys?status=active&limit=100&offset=0");

  if (!list.res.ok) {
    console.warn("[auto-finalize] list active surveys failed", list.res.status, list.text);
    return;
  }

  const surveys = getSurveysFromList(list.data);

  console.log(JSON.stringify({
    autoFinalize: "scan",
    api: API,
    now,
    activeCount: surveys.length,
  }, null, 2));

  for (const item of surveys) {
    const surveyId = item?.id || item?.surveyId;

    if (!surveyId) {
      continue;
    }

    const detailResponse = await readJson(`/mvp/surveys/${encodeURIComponent(surveyId)}`);

    if (!detailResponse.res.ok) {
      console.warn("[auto-finalize] detail failed", surveyId, detailResponse.res.status, detailResponse.text);
      continue;
    }

    const survey = getSurvey(detailResponse.data, item);
    const jobs = getJobs(detailResponse.data);
    const status = String(survey?.status || "");
    const endTime = getEndTime(survey);

    if (status !== "active") {
      continue;
    }

    if (!endTime) {
      console.warn("[auto-finalize] skip: no endTime", surveyId);
      continue;
    }

    if (now < endTime) {
      console.log(JSON.stringify({
        autoFinalize: "skip_not_ended",
        surveyId,
        surveyKey: survey?.surveyKey || survey?.survey_key,
        now,
        endTime,
        retryAfterSeconds: endTime - now,
      }, null, 2));
      continue;
    }

    if (hasFinalizeJob(jobs)) {
      console.log(JSON.stringify({
        autoFinalize: "skip_finalize_job_exists",
        surveyId,
        surveyKey: survey?.surveyKey || survey?.survey_key,
      }, null, 2));
      continue;
    }

    const finalize = await readJson(
      `/mvp/surveys/${encodeURIComponent(surveyId)}/request-finalize`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "auto-finalize after survey endTime",
        }),
      },
    );

    if (!finalize.res.ok) {
      console.warn("[auto-finalize] request-finalize failed", surveyId, finalize.res.status, finalize.text);
      continue;
    }

    console.log(JSON.stringify({
      autoFinalize: "created_finalize_job",
      surveyId,
      response: finalize.data,
    }, null, 2));
  }
}

main().catch((err) => {
  console.warn("[auto-finalize] failed", err?.stack || err?.message || String(err));
  process.exit(0);
});
