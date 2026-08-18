import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ZKPassportQRCode } from "@zkpassport/ui/react";

type NormalizedPayload = {
  verified: boolean;
  subjectHash: string;
  ageBucket: string;
  countryBucket: string;
  validUntil: string | null;
  rawResult?: unknown;
  providerPayloadVersion?: string | null;
};

type ZkPassportResultPayload = {
  uniqueIdentifier?: string;
  verified?: boolean;
  result?: unknown;
};

const els = {
  backendUrl: document.getElementById("backendUrl") as HTMLInputElement,
  surveyId: document.getElementById("surveyId") as HTMLInputElement,
  walletAddress: document.getElementById("walletAddress") as HTMLInputElement,
  subjectHash: document.getElementById(
    "subjectHash",
  ) as HTMLInputElement | null,

  createSessionBtn: document.getElementById(
    "createSessionBtn",
  ) as HTMLButtonElement,
  createSessionStatus: document.getElementById(
    "createSessionStatus",
  ) as HTMLDivElement,
  sessionIdView: document.getElementById("sessionIdView") as HTMLDivElement,

  startVerifyBtn: document.getElementById(
    "startVerifyBtn",
  ) as HTMLButtonElement,
  verifyStatus: document.getElementById("verifyStatus") as HTMLDivElement,
  requestIdView: document.getElementById("requestIdView") as HTMLDivElement,
  requestLink: document.getElementById("requestLink") as HTMLAnchorElement,
  qrBox: document.getElementById("qrBox") as HTMLDivElement,
  qrCanvas: document.getElementById("qrCanvas") as HTMLCanvasElement,

  callbackStageView: document.getElementById(
    "callbackStageView",
  ) as HTMLDivElement,
  callbackTimeView: document.getElementById(
    "callbackTimeView",
  ) as HTMLDivElement,
  lastRawResultView: document.getElementById(
    "lastRawResultView",
  ) as HTMLTextAreaElement,
  lastRawErrorView: document.getElementById(
    "lastRawErrorView",
  ) as HTMLTextAreaElement,

  validUntil: document.getElementById("validUntil") as HTMLInputElement | null,
  normalizedView: document.getElementById("normalizedView") as HTMLPreElement,

  sendResultBtn: document.getElementById("sendResultBtn") as HTMLButtonElement,
  refreshEligibilityBtn: document.getElementById(
    "refreshEligibilityBtn",
  ) as HTMLButtonElement,
  loadAggregatesBtn: document.getElementById(
    "loadAggregatesBtn",
  ) as HTMLButtonElement,
  backendStatus: document.getElementById("backendStatus") as HTMLDivElement,

  output: document.getElementById("output") as HTMLTextAreaElement,
};

let currentSessionId: string | null = null;
let latestNormalizedPayload: NormalizedPayload | null = null;
let latestRawResult: unknown = null;
let latestProofEvents: unknown[] = [];
let officialQrRoot: Root | null = null;

type IssuerCredentialResponse = {
  ok?: boolean;
  txHash?: string;
  error?: string;
  normalized?: unknown;
  credential?: unknown;
};

const issuerEls = createIssuerControls();

function appendLog(value: unknown) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  console.log("[verify-real]", value);

  const current = els.output.value.trim();
  els.output.value = current ? `${current}\n\n${text}` : text;
  els.output.scrollTop = els.output.scrollHeight;
}

function summarizeUnknown(value: unknown, depth = 0): unknown {
  if (value === null) return null;

  if (typeof value === "string") {
    return {
      type: "string",
      length: value.length,
      preview:
        value.length > 24
          ? `${value.slice(0, 12)}...${value.slice(-8)}`
          : value,
    };
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return {
      type: typeof value,
      value,
    };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample:
        depth >= 2
          ? "max_depth"
          : value.slice(0, 3).map((item) => summarizeUnknown(item, depth + 1)),
    };
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    return {
      type: "object",
      keys,
      fields:
        depth >= 2
          ? "max_depth"
          : Object.fromEntries(
              keys
                .slice(0, 30)
                .map((key) => [key, summarizeUnknown(obj[key], depth + 1)]),
            ),
    };
  }

  return {
    type: typeof value,
  };
}

function findInterestingProofLikePaths(value: unknown): string[] {
  const interesting = [
    "proof",
    "publicInputs",
    "public_inputs",
    "inputs",
    "vkeyHash",
    "verificationKey",
    "verification_key",
    "version",
    "name",
    "scope",
    "domain",
    "uniqueIdentifier",
    "nullifier",
    "commitment",
    "result",
    "verified",
  ];

  const paths: string[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown, path: string[], depth: number) {
    if (!node || typeof node !== "object" || depth > 5) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.slice(0, 5).forEach((item, index) => {
        visit(item, [...path, String(index)], depth + 1);
      });
      return;
    }

    const obj = node as Record<string, unknown>;

    for (const [key, child] of Object.entries(obj)) {
      if (interesting.includes(key)) {
        paths.push([...path, key].join("."));
      }

      visit(child, [...path, key], depth + 1);
    }
  }

  visit(value, [], 0);

  return Array.from(new Set(paths)).sort();
}

function logSpikeSummary(stage: string, payload: unknown) {
  appendLog({
    stage,
    spikeSummary: summarizeUnknown(payload),
    interestingPaths: findInterestingProofLikePaths(payload),
  });
}

function setStatus(el: HTMLDivElement, text: string, kind = "") {
  el.textContent = text;
  el.className = `status${kind ? ` ${kind}` : ""}`;
}

function setCallbackStage(stage: string, payload?: unknown, error?: unknown) {
  els.callbackStageView.textContent = stage;
  els.callbackTimeView.textContent = new Date().toISOString();

  if (payload !== undefined) {
    els.lastRawResultView.value =
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  }

  if (error !== undefined) {
    els.lastRawErrorView.value =
      typeof error === "string" ? error : JSON.stringify(error, null, 2);
  }

  appendLog({ stage, payload, error });
}

function getBackendUrl() {
  return els.backendUrl.value.trim().replace(/\/+$/, "");
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, raw: text };
  }
}

function createIssuerControls() {
  const container = document.createElement("section");
  container.style.marginTop = "16px";
  container.style.padding = "12px";
  container.style.border = "1px solid #ddd";
  container.style.borderRadius = "8px";

  container.innerHTML = `
    <h3 style="margin-top:0">Aztec credential issuer bridge</h3>
    <label style="display:block;margin:6px 0">
      Issuer service URL
      <input id="issuerServiceUrl" value="http://127.0.0.1:8790" style="width:100%" />
    </label>
    <label style="display:block;margin:6px 0">
      Aztec recipient / local alias
      <input id="issuerRecipient" value="accounts:test2" style="width:100%" />
    </label>
    <label style="display:block;margin:6px 0">
      Birthdate override / debug fallback
      <input id="issuerBirthdate" placeholder="1991-10-25T00:00:00.000Z" style="width:100%" />
    </label>
    <label style="display:block;margin:6px 0">
      Country override / debug fallback
      <input id="issuerCountry" placeholder="RUS or RU" style="width:100%" />
    </label>
    <label style="display:block;margin:6px 0">
      Valid until
      <input id="issuerValidUntil" value="999999" style="width:100%" />
    </label>
    <button id="issueCredentialBtn" type="button" disabled>Issue Aztec Credential</button>
    <div id="issuerStatus" class="status" style="margin-top:8px">Waiting for zkPassport result.</div>
    <pre id="issuerOutput" style="white-space:pre-wrap;max-height:220px;overflow:auto;background:#f7f7f7;padding:8px;border-radius:6px">—</pre>
  `;

  const anchor = els.output.parentElement || document.body;
  anchor.appendChild(container);

  return {
    issuerServiceUrl: container.querySelector(
      "#issuerServiceUrl",
    ) as HTMLInputElement,
    issuerRecipient: container.querySelector(
      "#issuerRecipient",
    ) as HTMLInputElement,
    issuerBirthdate: container.querySelector(
      "#issuerBirthdate",
    ) as HTMLInputElement,
    issuerCountry: container.querySelector(
      "#issuerCountry",
    ) as HTMLInputElement,
    issuerValidUntil: container.querySelector(
      "#issuerValidUntil",
    ) as HTMLInputElement,
    issueCredentialBtn: container.querySelector(
      "#issueCredentialBtn",
    ) as HTMLButtonElement,
    issuerStatus: container.querySelector("#issuerStatus") as HTMLDivElement,
    issuerOutput: container.querySelector("#issuerOutput") as HTMLPreElement,
  };
}

function setIssuerStatus(text: string, kind = "") {
  issuerEls.issuerStatus.textContent = text;
  issuerEls.issuerStatus.className = `status${kind ? ` ${kind}` : ""}`;
}

function renderIssuerOutput(value: unknown) {
  issuerEls.issuerOutput.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function extractIssuerPartsFromZkPassportPayload(payload: unknown) {
  const raw = payload as any;
  const result = raw?.result ?? {};

  const birthdate =
    result?.birthdate?.disclose?.result ??
    result?.birthdate?.result ??
    result?.birthdate ??
    null;

  const nationality =
    result?.nationality?.disclose?.result ??
    result?.nationality?.result ??
    result?.nationality ??
    null;

  let normalizedBirthdate =
    typeof birthdate === "string" && birthdate.trim() ? birthdate.trim() : null;

  if (!normalizedBirthdate) {
    try {
      const serialized = JSON.stringify(payload);
      const isoMatch = serialized.match(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
      );
      const compactMatch = serialized.match(/RUS(\d{6})/);

      if (isoMatch?.[0]) {
        normalizedBirthdate = isoMatch[0];
      } else if (compactMatch?.[1]) {
        const yy = Number(compactMatch[1].slice(0, 2));
        const year =
          yy >= 30
            ? `19${compactMatch[1].slice(0, 2)}`
            : `20${compactMatch[1].slice(0, 2)}`;
        const month = compactMatch[1].slice(2, 4);
        const day = compactMatch[1].slice(4, 6);
        normalizedBirthdate = `${year}-${month}-${day}T00:00:00.000Z`;
      }
    } catch {
      normalizedBirthdate = null;
    }
  }

  const normalizedCountry =
    typeof nationality === "string" && nationality.trim()
      ? normalizeCountryBucket(nationality.trim())
      : "OTHER_UNKNOWN";

  return {
    birthdate: normalizedBirthdate,
    country: normalizedCountry,
    rawCountry: typeof nationality === "string" ? nationality.trim() : null,
    debugBirthdateType: typeof birthdate,
    debugBirthdateValue: birthdate,
  };
}

function deepFindStringByPathHint(
  value: unknown,
  fieldName: "birthdate" | "nationality",
): string | null {
  const seen = new Set<unknown>();

  function visit(node: unknown, path: string[]): string | null {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    const obj = node as Record<string, unknown>;

    if (fieldName in obj) {
      const direct = obj[fieldName];

      if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
      }

      if (direct && typeof direct === "object") {
        const d = direct as any;
        const nested = d?.disclose?.result ?? d?.result ?? d?.value ?? null;

        if (typeof nested === "string" && nested.trim()) {
          return nested.trim();
        }
      }
    }

    for (const [key, child] of Object.entries(obj)) {
      const found = visit(child, [...path, key]);
      if (found) return found;
    }

    return null;
  }

  return visit(value, []);
}

function getZkPassportResultParts() {
  const manualBirthdate = issuerEls.issuerBirthdate.value.trim();
  const manualCountry = issuerEls.issuerCountry.value.trim();

  if (manualBirthdate && manualCountry) {
    return {
      birthdate: manualBirthdate,
      country: normalizeCountryBucket(manualCountry),
    };
  }

  const candidates = [
    latestRawResult,
    (window as any).__dscopeLatestZkPassportResult,
    latestNormalizedPayload,
  ] as unknown[];

  for (const candidate of candidates) {
    const direct = extractIssuerPartsFromZkPassportPayload(candidate);

    if (direct.birthdate && direct.country !== "OTHER_UNKNOWN") {
      issuerEls.issuerBirthdate.value = direct.birthdate;
      issuerEls.issuerCountry.value = direct.rawCountry || direct.country;

      return {
        birthdate: direct.birthdate,
        country: direct.country,
      };
    }

    const birthdate = deepFindStringByPathHint(candidate, "birthdate");
    const nationality = deepFindStringByPathHint(candidate, "nationality");

    const normalizedCountry =
      nationality && nationality.trim()
        ? normalizeCountryBucket(nationality.trim())
        : "OTHER_UNKNOWN";

    if (birthdate && normalizedCountry !== "OTHER_UNKNOWN") {
      issuerEls.issuerBirthdate.value = birthdate;
      issuerEls.issuerCountry.value = nationality || normalizedCountry;

      return {
        birthdate,
        country: normalizedCountry,
      };
    }
  }

  return {
    birthdate: null,
    country: "OTHER_UNKNOWN",
  };
}

function updateIssuerButtonState() {
  issuerEls.issueCredentialBtn.disabled = !latestNormalizedPayload?.verified;

  if (!latestNormalizedPayload) {
    setIssuerStatus("Waiting for zkPassport result.");
    return;
  }

  if (!latestNormalizedPayload.verified) {
    setIssuerStatus("zkPassport result is not verified.", "bad");
    return;
  }

  const parts = getZkPassportResultParts();

  if (!parts.birthdate || parts.country === "OTHER_UNKNOWN") {
    setIssuerStatus(
      "Verified result received, but birthdate or nationality is missing/unknown. Check issuer-parts-detected log or fill fallback fields.",
      "bad",
    );
    return;
  }

  setIssuerStatus(
    `Ready to issue credential: birthdate=${parts.birthdate}, country=${parts.country}`,
    "good",
  );
}

async function issueAztecCredentialFromZkPassportResult() {
  if (!latestNormalizedPayload?.verified) {
    setIssuerStatus("No verified zkPassport result is ready.", "bad");
    return;
  }

  const issuerServiceUrl = issuerEls.issuerServiceUrl.value
    .trim()
    .replace(/\/+$/, "");
  const to = issuerEls.issuerRecipient.value.trim();
  const validUntil = issuerEls.issuerValidUntil.value.trim() || "999999";
  const parts = getZkPassportResultParts();

  if (!issuerServiceUrl || !to) {
    setIssuerStatus("Issuer service URL and recipient are required.", "bad");
    return;
  }

  if (!parts.birthdate || parts.country === "OTHER_UNKNOWN") {
    setIssuerStatus(
      "Cannot issue credential: birthdate or country is missing.",
      "bad",
    );
    return;
  }

  const payload = {
    to,
    birthdate: parts.birthdate,
    country: parts.country,
    validUntil,
    sourceTag: 1,
    credentialVersion: 1,
    subjectHash: latestNormalizedPayload.subjectHash,
    providerPayloadVersion:
      latestNormalizedPayload.providerPayloadVersion ?? null,
  };

  setIssuerStatus("Issuing Aztec credential via issuer service...");
  renderIssuerOutput({ request: payload });

  try {
    const res = await fetch(`${issuerServiceUrl}/issuer/issue-credential`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await safeJson(res)) as IssuerCredentialResponse;
    appendLog({ stage: "issuer-credential-response", json });
    renderIssuerOutput(json);

    if (!res.ok || !json.ok) {
      setIssuerStatus(json.error || "Failed to issue Aztec credential.", "bad");
      return;
    }

    setIssuerStatus(`Credential issued. Tx: ${json.txHash}`, "good");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown issuer error";
    setIssuerStatus(message, "bad");
    renderIssuerOutput({ ok: false, error: message });
  }
}

function normalizeCountryBucket(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "OTHER_UNKNOWN";
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === "RUS") return "RU";
  if (normalized === "DEU") return "DE";
  if (normalized === "USA") return "US";
  if (normalized === "GBR") return "GB";
  if (normalized === "FRA") return "FR";
  if (normalized === "AUT") return "AT";
  if (normalized === "UKR") return "UA";

  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  return "OTHER_UNKNOWN";
}

function deriveAgeBucketFromBirthdate(value: string | null): string {
  if (!value) return "other_unknown";

  const birthMs = Date.parse(value);
  if (Number.isNaN(birthMs)) return "other_unknown";

  const birth = new Date(birthMs);
  const now = new Date();

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  const dayDelta = now.getUTCDate() - birth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  if (age >= 18 && age <= 25) return "18_25";
  if (age >= 26 && age <= 30) return "26_30";
  if (age >= 31 && age <= 35) return "31_35";
  if (age >= 36 && age <= 45) return "36_45";
  if (age >= 46 && age <= 50) return "46_50";
  if (age >= 51 && age <= 55) return "51_55";
  if (age >= 56 && age <= 60) return "56_60";
  if (age >= 61) return "61_plus";

  return "other_unknown";
}

function renderNormalizedPayload(payload: NormalizedPayload | null) {
  if (!payload) {
    els.normalizedView.textContent = "—";
    els.sendResultBtn.disabled = true;
    updateIssuerButtonState();
    return;
  }

  const preview = {
    verified: payload.verified,
    subjectHash: payload.subjectHash,
    ageBucket: payload.ageBucket,
    countryBucket: payload.countryBucket,
    validUntil: payload.validUntil,
    rawResultMode:
      payload.rawResult === undefined
        ? "not_sent_to_backend"
        : "custom_payload_present",
    providerPayloadVersion: payload.providerPayloadVersion ?? null,
  };

  els.normalizedView.textContent = JSON.stringify(preview, null, 2);
  els.sendResultBtn.disabled = !currentSessionId;
  updateIssuerButtonState();
}

async function createVerificationSession() {
  const backendUrl = getBackendUrl();
  const surveyId = els.surveyId.value.trim();
  const walletAddress = els.walletAddress.value.trim();
  const subjectHash = els.subjectHash?.value.trim() || null;

  if (!surveyId || !walletAddress) {
    setStatus(
      els.createSessionStatus,
      "Survey ID and wallet address are required.",
      "bad",
    );
    return;
  }

  setStatus(els.createSessionStatus, "Creating verification session...");

  try {
    const res = await fetch(
      `${backendUrl}/surveys/${encodeURIComponent(
        surveyId,
      )}/verification-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          subjectHash: subjectHash || undefined,
        }),
      },
    );

    const json = await safeJson(res);
    appendLog({ stage: "create-session-response", json });

    if (!res.ok || !json.ok) {
      setStatus(
        els.createSessionStatus,
        json.error || "Failed to create verification session.",
        "bad",
      );
      return;
    }

    currentSessionId = json.verificationSession.id;
    els.sessionIdView.textContent = currentSessionId;

    if (json.reused) {
      setStatus(
        els.createSessionStatus,
        `Reused existing eligibility via session: ${currentSessionId}`,
        "good",
      );
    } else {
      setStatus(
        els.createSessionStatus,
        `Verification session created: ${currentSessionId}`,
        "good",
      );
    }
  } catch (err) {
    setStatus(
      els.createSessionStatus,
      err instanceof Error ? err.message : "Unknown error",
      "bad",
    );
  }
}

async function renderQr(url: string) {
  els.qrBox.style.display = "inline-block";
  await QRCode.toCanvas(els.qrCanvas, url, {
    width: 240,
    margin: 1,
  });
}

async function startZkPassportRequest() {
  latestNormalizedPayload = null;
  latestRawResult = null;
  latestProofEvents = [];
  (window as any).__dscopeLatestZkPassportResult = null;

  issuerEls.issuerBirthdate.value = "";
  issuerEls.issuerCountry.value = "";
  renderNormalizedPayload(null);

  els.lastRawResultView.value = "";
  els.lastRawErrorView.value = "";
  els.callbackStageView.textContent = "starting-official-ui";
  els.callbackTimeView.textContent = new Date().toISOString();

  try {
    appendLog("🔘 official ZKPassportQRCode test started");
    setStatus(
      els.verifyStatus,
      "Rendering official ZKPassport QR component...",
      "good",
    );

    els.qrBox.style.display = "inline-block";
    els.qrBox.style.background = "#ffffff";
    els.qrBox.style.padding = "16px";
    els.qrBox.style.borderRadius = "12px";

    els.qrBox.innerHTML = "";

    const host = document.createElement("div");
    host.id = "official-zkpassport-qr-root";
    els.qrBox.appendChild(host);

    if (officialQrRoot) {
      officialQrRoot.unmount();
      officialQrRoot = null;
    }

    officialQrRoot = createRoot(host);

    officialQrRoot.render(
      React.createElement(ZKPassportQRCode, {
        domain: "app.dscope.app",
        name: "D-Scope",
        purpose: "Private eligibility verification for D-Scope surveys",
        scope: `dscope-verify-real-birthdate-${Date.now()}`,
        query: (builder: any) =>
          builder
            .gte("age", 18)
            .disclose("nationality")
            .disclose("birthdate")
            .done(),
        onResult: (payload: any) => {
          appendLog("🎯 official ZKPassportQRCode onResult received");
          appendLog(payload);

          setCallbackStage("official-qr-result", payload);

          latestRawResult = payload;
          (window as any).__dscopeLatestZkPassportResult = payload;

          const detectedIssuerParts =
            extractIssuerPartsFromZkPassportPayload(payload);

          if (detectedIssuerParts.birthdate) {
            issuerEls.issuerBirthdate.value = detectedIssuerParts.birthdate;
          }

          if (detectedIssuerParts.rawCountry) {
            issuerEls.issuerCountry.value = detectedIssuerParts.rawCountry;
          }

          appendLog({
            stage: "official-issuer-parts-detected",
            payload: detectedIssuerParts,
          });

          const subjectHash =
            typeof payload?.uniqueIdentifier === "string"
              ? payload.uniqueIdentifier.trim()
              : "";

          const normalized = {
            verified: Boolean(payload?.verified),
            subjectHash,
            ageBucket: deriveAgeBucketFromBirthdate(
              detectedIssuerParts.birthdate,
            ),
            countryBucket: detectedIssuerParts.country,
            validUntil: els.validUntil?.value?.trim() || null,
            rawResult: undefined,
            providerPayloadVersion:
              "zkpassport-ui-0.16.0-official-ui-policy-my-first-policy-v1",
          } satisfies NormalizedPayload;

          latestNormalizedPayload = normalized;
          updateIssuerButtonState();

          if (els.subjectHash) {
            els.subjectHash.value = normalized.subjectHash;
          }

          renderNormalizedPayload(normalized);

          setStatus(
            els.verifyStatus,
            normalized.verified
              ? "✅ Official ZKPassport verification succeeded."
              : "❌ Official ZKPassport returned verified=false.",
            normalized.verified ? "good" : "bad",
          );
        },
      }),
    );

    els.requestIdView.textContent = "official-ui-component";
    els.requestLink.href = "https://app.dscope.app";
    els.requestLink.textContent =
      "Official ZKPassportQRCode is rendered below.";

    setCallbackStage("official-qr-rendered", {
      domain: "app.dscope.app",
      policy: "my-first-policy",
    });

    setStatus(
      els.verifyStatus,
      "Official QR ready. Scan with ZKPassport app.",
      "good",
    );
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));

    console.error("🚨 OFFICIAL QR INIT ERROR:", err);

    appendLog("🚨 official QR top-level-catch:");
    appendLog({
      message: err.message,
      stack: err.stack,
    });

    setCallbackStage("official-qr-top-level-catch", undefined, {
      message: err.message,
      stack: err.stack,
    });

    setStatus(els.verifyStatus, err.message, "bad");
  }
}

async function sendNormalizedResultToBackend() {
  if (!currentSessionId) {
    setStatus(els.backendStatus, "No verification session id.", "bad");
    return;
  }

  if (!latestNormalizedPayload) {
    setStatus(els.backendStatus, "No normalized payload ready yet.", "bad");
    return;
  }

  const backendUrl = getBackendUrl();

  setStatus(
    els.backendStatus,
    `Sending normalized result to backend for session ${currentSessionId}...`,
  );

  try {
    const res = await fetch(
      `${backendUrl}/verification-sessions/${encodeURIComponent(
        currentSessionId,
      )}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latestNormalizedPayload),
      },
    );

    const json = await safeJson(res);
    appendLog({ stage: "backend-complete-response", json });

    if (!res.ok || !json.ok) {
      setStatus(
        els.backendStatus,
        json.error || "Failed to complete verification session.",
        "bad",
      );
      return;
    }

    setStatus(
      els.backendStatus,
      `Backend completion succeeded. Eligibility: ${json.eligibility?.eligibility_status || "unknown"}. Reason: ${json.policyDecision?.reasonCode || "unknown"}`,
      "good",
    );
  } catch (err) {
    setStatus(
      els.backendStatus,
      err instanceof Error ? err.message : "Unknown error",
      "bad",
    );
  }
}

async function refreshEligibility() {
  const backendUrl = getBackendUrl();
  const surveyId = els.surveyId.value.trim();
  const walletAddress = els.walletAddress.value.trim();

  try {
    const res = await fetch(
      `${backendUrl}/surveys/${encodeURIComponent(
        surveyId,
      )}/eligibility?wallet=${encodeURIComponent(walletAddress)}`,
    );

    const json = await safeJson(res);
    appendLog({ stage: "eligibility-response", json });

    if (!res.ok || !json.ok) {
      setStatus(
        els.backendStatus,
        json.error || "Failed to load eligibility.",
        "bad",
      );
      return;
    }

    setStatus(
      els.backendStatus,
      `Eligibility: ${json.eligibility?.eligibility_status ?? "null"}`,
      json.eligibility?.eligibility_status === "eligible" ? "good" : "",
    );
  } catch (err) {
    setStatus(
      els.backendStatus,
      err instanceof Error ? err.message : "Unknown error",
      "bad",
    );
  }
}

async function loadAggregates() {
  const backendUrl = getBackendUrl();
  const surveyId = els.surveyId.value.trim();

  try {
    const res = await fetch(
      `${backendUrl}/surveys/${encodeURIComponent(
        surveyId,
      )}/predicate-aggregates`,
    );

    const json = await safeJson(res);
    appendLog({ stage: "aggregates-response", json });

    if (!res.ok || !json.ok) {
      setStatus(
        els.backendStatus,
        json.error || "Failed to load aggregates.",
        "bad",
      );
      return;
    }

    setStatus(
      els.backendStatus,
      `Loaded ${json.aggregates?.length || 0} aggregate rows.`,
      "good",
    );
  } catch (err) {
    setStatus(
      els.backendStatus,
      err instanceof Error ? err.message : "Unknown error",
      "bad",
    );
  }
}

console.log("verify-real.ts loaded");
appendLog("verify-real.ts loaded");

els.createSessionBtn.addEventListener("click", createVerificationSession);
els.startVerifyBtn.addEventListener("click", startZkPassportRequest);
els.sendResultBtn.addEventListener("click", sendNormalizedResultToBackend);
els.refreshEligibilityBtn.addEventListener("click", refreshEligibility);
els.loadAggregatesBtn.addEventListener("click", loadAggregates);
issuerEls.issueCredentialBtn.addEventListener(
  "click",
  issueAztecCredentialFromZkPassportResult,
);
issuerEls.issuerBirthdate.addEventListener("input", updateIssuerButtonState);
issuerEls.issuerCountry.addEventListener("input", updateIssuerButtonState);
