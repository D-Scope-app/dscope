import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const API =
  process.env.RUNNER_API_BASE_URL ||
  process.env.API ||
  "https://app.dscope.app";
const TOKEN = process.env.INTERNAL_RUNNER_TOKEN;
const NODE_URL = process.env.AZTEC_NODE_URL || process.env.NODE_URL;
const FROM =
  process.env.AZTEC_FROM_ALIAS || process.env.FROM || "accounts:dscope-runner";
const SPONSORED_FPC_ADDRESS = process.env.SPONSORED_FPC_ADDRESS;
const WALLET_DATA_DIR =
  process.env.AZTEC_WALLET_DATA_DIR ||
  process.env.WALLET_DATA_DIR ||
  process.env.DATA_DIR;
const PAY =
  process.env.PAY || `method=fpc-sponsored,fpc=${SPONSORED_FPC_ADDRESS}`;
const RUNNER_ID = process.env.RUNNER_ID || "vps-testnet-runner-1";

const ARTIFACTS = {
  factory:
    process.env.FACTORY_ARTIFACT ||
    "/opt/dscope/contracts/survey_factory/target/survey_factory-SurveyFactory.json",
  gate:
    process.env.GATE_ARTIFACT ||
    "/opt/dscope/contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json",
  reward:
    process.env.REWARD_ARTIFACT ||
    "/opt/dscope/contracts/reward_vault_mvp/target/reward_vault_mvp-RewardVaultMVP.json",
  core:
    process.env.CORE_ARTIFACT ||
    "/opt/dscope/contracts/dscope_core/target/dscope_core-DScopeCore.json",
};

function assertEnv() {
  for (const [name, value] of Object.entries({
    API,
    TOKEN,
    NODE_URL,
    FROM,
    PAY,
  })) {
    if (!value) throw new Error(`Missing env ${name}`);
  }
}

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.ok === false) {
    throw new Error(`POST ${path} failed: ${text}`);
  }
  return json;
}

async function postHeartbeat(status, payload = {}) {
  try {
    await postJson("/internal/ops/heartbeat", {
      service: "testnet-runner",
      serviceId: RUNNER_ID,
      status,
      payload: {
        runnerId: RUNNER_ID,
        api: API,
        nodeUrl: NODE_URL,
        from: FROM,
        ...payload,
      },
    });
  } catch (err) {
    console.error(
      `[heartbeat:warn] ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function claimNextJob() {
  return postJson("/internal/runner/jobs/next", {
    runnerId: RUNNER_ID,
    jobTypes: ["create_survey_mvp", "finalize_survey_mvp"],
  });
}

async function markDone(jobId, events) {
  return postJson(`/internal/runner/jobs/${jobId}/done`, { events });
}

async function markFailed(jobId, error, events = []) {
  return postJson(`/internal/runner/jobs/${jobId}/failed`, { error, events });
}

function event(jobId, type, message, data = {}) {
  return { jobId, type, message, data, createdAt: new Date().toISOString() };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientAztecError(output) {
  return [
    "Tx dropped by P2P node",
    "was dropped",
    "Block hash",
    "not found when querying world state",
    "possibly a reorg has occurred",
    "fetch failed",
    "ECONNRESET",
    "ETIMEDOUT",
  ].some((needle) => output.includes(needle));
}

async function wallet(args, label) {
  if (!WALLET_DATA_DIR) {
    throw new Error(
      "Missing wallet data-dir env (AZTEC_WALLET_DATA_DIR/WALLET_DATA_DIR/DATA_DIR)",
    );
  }

  const walletArgs = ["--data-dir", WALLET_DATA_DIR, ...args];
  const attempts = Number(process.env.AZTEC_WALLET_ATTEMPTS || "3");
  let lastOutput = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`\n[aztec-wallet] ${label} attempt ${attempt}/${attempts}`);
    console.log(["aztec-wallet", ...walletArgs].join(" "));

    try {
      const { stdout, stderr } = await execFileAsync("aztec-wallet", walletArgs, {
        maxBuffer: 1024 * 1024 * 80,
      });
      lastOutput = `${stdout}\n${stderr}`;
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      return lastOutput;
    } catch (err) {
      const stdout = err?.stdout || "";
      const stderr = err?.stderr || "";
      const message = err?.message || String(err);
      lastOutput = `${stdout}\n${stderr}\n${message}`;
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      console.error(message);

      if (attempt < attempts && isTransientAztecError(lastOutput)) {
        const delay = 30000 * attempt;
        console.error(
          `Transient Aztec error; retrying after ${delay / 1000}s...`,
        );
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  return lastOutput;
}

function parseDeploy(output) {
  const address = output.match(/Contract deployed at\s+(0x[a-fA-F0-9]+)/)?.[1];
  const tx =
    output.match(/Deployment tx hash:\s*(0x[a-fA-F0-9]+)/)?.[1] ||
    output.match(/Deploy tx hash:\s*(0x[a-fA-F0-9]+)/)?.[1] ||
    output.match(/Transaction hash:\s*(0x[a-fA-F0-9]+)/)?.[1];
  if (!address || !tx)
    throw new Error(`Could not parse deploy output:\n${output}`);
  return { address, tx };
}

function parseTx(output) {
  const tx =
    output.match(/Transaction hash:\s*(0x[a-fA-F0-9]+)/)?.[1] ||
    output.match(/Deployment tx hash:\s*(0x[a-fA-F0-9]+)/)?.[1];
  if (!tx) throw new Error(`Could not parse tx output:\n${output}`);
  return tx;
}

function parseSimulationNumber(output) {
  return output.match(/Simulation result:\s*([0-9]+)n?/)?.[1] || "0";
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function computeMvpNumericHash(value) {
  const input = stableStringify(value);
  let hash = 2166136261n;
  const prime = 16777619n;
  const modulo = 2n ** 64n;
  for (let i = 0; i < input.length; i++) {
    hash = hash ^ BigInt(input.charCodeAt(i));
    hash = (hash * prime) % modulo;
  }
  return hash === 0n ? "1" : hash.toString();
}

const AGE_BUCKET_INDEX = Object.freeze({
  "18_25": 0,
  "26_30": 1,
  "31_35": 2,
  "36_45": 3,
  "46_50": 4,
  "51_55": 5,
  "56_60": 6,
  "61_PLUS": 7,
  "61_plus": 7,
  OTHER_UNKNOWN: 8,
  other_unknown: 8,
});

const COUNTRY_CODE = Object.freeze({
  AD: 20,
  AE: 784,
  AF: 4,
  AL: 8,
  AM: 51,
  AO: 24,
  AR: 32,
  AT: 40,
  AU: 36,
  AZ: 31,
  BA: 70,
  BD: 50,
  BE: 56,
  BG: 100,
  BH: 48,
  BN: 96,
  BO: 68,
  BR: 76,
  BT: 64,
  BW: 72,
  BY: 112,
  CA: 124,
  CH: 756,
  CI: 384,
  CL: 152,
  CM: 120,
  CN: 156,
  CO: 170,
  CY: 196,
  CZ: 203,
  DE: 276,
  DK: 208,
  DZ: 12,
  EC: 218,
  EE: 233,
  EG: 818,
  ES: 724,
  ET: 231,
  FI: 246,
  FJ: 242,
  FR: 250,
  GB: 826,
  GE: 268,
  GF: 254,
  GH: 288,
  GR: 300,
  GY: 328,
  HK: 344,
  HR: 191,
  HU: 348,
  ID: 360,
  IE: 372,
  IL: 376,
  IN: 356,
  IQ: 368,
  IR: 364,
  IS: 352,
  IT: 380,
  JO: 400,
  JP: 392,
  KE: 404,
  KG: 417,
  KH: 116,
  KP: 408,
  KR: 410,
  KW: 414,
  KZ: 398,
  LA: 418,
  LB: 422,
  LI: 438,
  LK: 144,
  LT: 440,
  LU: 442,
  LV: 428,
  LY: 434,
  MA: 504,
  MC: 492,
  MD: 498,
  ME: 499,
  MK: 807,
  MM: 104,
  MN: 496,
  MO: 446,
  MT: 470,
  MV: 462,
  MX: 484,
  MY: 458,
  MZ: 508,
  NA: 516,
  NG: 566,
  NL: 528,
  NO: 578,
  NP: 524,
  NZ: 554,
  OM: 512,
  PE: 604,
  PG: 598,
  PH: 608,
  PK: 586,
  PL: 616,
  PS: 275,
  PT: 620,
  PY: 600,
  QA: 634,
  RO: 642,
  RS: 688,
  RU: 643,
  RW: 646,
  SA: 682,
  SB: 90,
  SE: 752,
  SG: 702,
  SI: 705,
  SK: 703,
  SM: 674,
  SN: 686,
  SR: 740,
  SY: 760,
  TD: 148,
  TH: 764,
  TJ: 762,
  TL: 626,
  TM: 795,
  TN: 788,
  TO: 776,
  TR: 792,
  TW: 158,
  TZ: 834,
  UA: 804,
  UG: 800,
  US: 840,
  UY: 858,
  UZ: 860,
  VA: 336,
  VE: 862,
  VN: 704,
  VU: 548,
  WS: 882,
  YE: 887,
  ZA: 710,
  ZM: 894,
  ZW: 716,
});

const COUNTRY_ALIASES = Object.freeze({
  DEU: "DE",
  GER: "DE",
  RUS: "RU",
  USA: "US",
  GBR: "GB",
  UK: "GB",
  FRA: "FR",
  AUT: "AT",
  UKR: "UA",
});

const REGION_COUNTRIES = Object.freeze({
  EUROPE: [
    "AD",
    "AL",
    "AT",
    "BA",
    "BE",
    "BG",
    "BY",
    "CH",
    "CY",
    "CZ",
    "DE",
    "DK",
    "EE",
    "ES",
    "FI",
    "FR",
    "GB",
    "GR",
    "HR",
    "HU",
    "IE",
    "IS",
    "IT",
    "LI",
    "LT",
    "LU",
    "LV",
    "MC",
    "MD",
    "ME",
    "MK",
    "MT",
    "NL",
    "NO",
    "PL",
    "PT",
    "RO",
    "RS",
    "SE",
    "SI",
    "SK",
    "SM",
    "UA",
    "VA",
  ],
  CIS_EASTERN_EUROPE: [
    "AM",
    "AZ",
    "BY",
    "GE",
    "KZ",
    "KG",
    "MD",
    "RU",
    "TJ",
    "TM",
    "UA",
    "UZ",
  ],
  EECA: [
    "AM",
    "AZ",
    "BY",
    "GE",
    "KZ",
    "KG",
    "MD",
    "RU",
    "TJ",
    "TM",
    "UA",
    "UZ",
  ],
  NORTH_AMERICA: ["CA", "US"],
  LATIN_AMERICA: [
    "AR",
    "BO",
    "BR",
    "CL",
    "CO",
    "EC",
    "GF",
    "GY",
    "MX",
    "PE",
    "PY",
    "SR",
    "UY",
    "VE",
  ],
  MENA: [
    "AE",
    "BH",
    "DZ",
    "EG",
    "IQ",
    "IR",
    "IL",
    "JO",
    "KW",
    "LB",
    "LY",
    "MA",
    "OM",
    "PS",
    "QA",
    "SA",
    "SY",
    "TN",
    "TR",
    "YE",
  ],
  SUB_SAHARAN_AFRICA: [
    "AO",
    "BW",
    "CD",
    "CI",
    "CM",
    "ET",
    "GH",
    "KE",
    "MZ",
    "NA",
    "NG",
    "RW",
    "SN",
    "TZ",
    "UG",
    "ZA",
    "ZM",
    "ZW",
  ],
  SOUTH_ASIA: ["AF", "BD", "BT", "IN", "LK", "MV", "NP", "PK"],
  SOUTHEAST_ASIA: [
    "BN",
    "KH",
    "ID",
    "LA",
    "MM",
    "MY",
    "PH",
    "SG",
    "TH",
    "TL",
    "VN",
  ],
  EAST_ASIA: ["CN", "HK", "JP", "KP", "KR", "MN", "MO", "TW"],
  OCEANIA: ["AU", "FJ", "NZ", "PG", "SB", "TO", "VU", "WS"],
  OTHER_UNKNOWN: [],
});

function isAnySelection(value) {
  return (
    value === undefined ||
    value === null ||
    value === "ANY" ||
    value === "any" ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function asSelectionList(value) {
  if (isAnySelection(value)) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

function normalizeCountry(value) {
  const token = normalizeToken(value);
  return COUNTRY_ALIASES[token] || token;
}

function buildAgeMask(ageBuckets) {
  if (isAnySelection(ageBuckets)) {
    return { mode: "0", mask: "0" };
  }

  let mask = 0n;

  for (const raw of asSelectionList(ageBuckets)) {
    const token = normalizeToken(raw);
    const idx = AGE_BUCKET_INDEX[token];

    if (idx === undefined) {
      throw new Error(`Unsupported age bucket for testnet runner: ${raw}`);
    }

    mask |= 1n << BigInt(idx);
  }

  return {
    mode: mask === 0n ? "0" : "1",
    mask: mask.toString(),
  };
}

function collectPolicyCountries(countries, regions) {
  const selected = new Set();

  for (const raw of asSelectionList(countries)) {
    const country = normalizeCountry(raw);
    if (country && country !== "ANY") selected.add(country);
  }

  for (const raw of asSelectionList(regions)) {
    const region = normalizeToken(raw);
    const regionCountries = REGION_COUNTRIES[region];

    if (!regionCountries) {
      throw new Error(`Unsupported region for testnet runner: ${raw}`);
    }

    for (const country of regionCountries) selected.add(country);
  }

  return [...selected].sort();
}

function buildCountryBitmap(countries, regions) {
  if (isAnySelection(countries) && isAnySelection(regions)) {
    const chunks = Array(16).fill("0");
    return {
      mode: "0",
      chunks,
      bitmap: `[${chunks.join(",")}]`,
      selectedCountries: [],
    };
  }

  const selectedCountries = collectPolicyCountries(countries, regions);
  const chunks = Array(16).fill(0n);

  for (const country of selectedCountries) {
    const code = COUNTRY_CODE[country];

    if (code === undefined) {
      throw new Error(`Unsupported country for testnet runner: ${country}`);
    }

    const chunk = Math.floor(code / 64);
    const bit = code % 64;

    if (chunk < 0 || chunk >= chunks.length) {
      throw new Error(`Country code out of bitmap range: ${country}=${code}`);
    }

    chunks[chunk] |= 1n << BigInt(bit);
  }

  const stringChunks = chunks.map((chunk) => chunk.toString());

  return {
    mode: selectedCountries.length === 0 ? "0" : "1",
    chunks: stringChunks,
    bitmap: `[${stringChunks.join(",")}]`,
    selectedCountries,
  };
}

function policyArgs(payload) {
  const age = buildAgeMask(payload.ageBuckets);
  const country = buildCountryBitmap(payload.countries, payload.regions);

  return {
    ageMode: age.mode,
    ageMask: age.mask,
    countryMode: country.mode,
    countryBitmap: country.bitmap,
    countryBitmapArray: country.chunks,
    selectedCountries: country.selectedCountries,
    source: "testnet_cli_runner_once_allowlist_v20_1",
  };
}

async function deploy(artifact, alias, args) {
  return parseDeploy(
    await wallet(
      [
        "deploy",
        artifact,
        "--node-url",
        NODE_URL,
        "--from",
        FROM,
        "--payment",
        PAY,
        "--alias",
        alias,
        "--args",
        ...args.map(String),
      ],
      `deploy ${alias}`,
    ),
  );
}

async function send(functionName, address, artifact, args) {
  return parseTx(
    await wallet(
      [
        "send",
        functionName,
        "--node-url",
        NODE_URL,
        "--from",
        FROM,
        "--payment",
        PAY,
        "--contract-address",
        address,
        "--contract-artifact",
        artifact,
        "--args",
        ...args.map(String),
      ],
      `send ${functionName}`,
    ),
  );
}

async function simulate(functionName, address, artifact, args = []) {
  return wallet(
    [
      "simulate",
      functionName,
      "--node-url",
      NODE_URL,
      "--from",
      FROM,
      "--contract-address",
      address,
      "--contract-artifact",
      artifact,
      ...(args.length ? ["--args", ...args.map(String)] : []),
    ],
    `simulate ${functionName}`,
  );
}

async function getCheckpoint(job) {
  const jobId = typeof job === "string" ? job : job.id;

  const res = await fetch(
    `${API}/internal/runner/jobs/${encodeURIComponent(jobId)}/checkpoint`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    },
  );

  const text = await res.text();

  // v19.7.1 compatibility:
  // Some deployed Worker versions do not yet expose checkpoint routes.
  // In that case runner must continue without checkpoint instead of dying before Aztec work.
  if (res.status === 404 && text.includes("internal_runner_route_not_found")) {
    console.warn(
      `[checkpoint:fallback] remote checkpoint route missing for ${jobId}; continuing without remote checkpoint`,
    );
    return {};
  }

  if (!res.ok) {
    throw new Error(
      `checkpoint GET failed for ${jobId}: ${res.status} ${text}`,
    );
  }

  if (!text) return {};

  const data = JSON.parse(text);
  return data.checkpoint || data.data || {};
}

async function saveCheckpoint(job, patch) {
  const jobId = typeof job === "string" ? job : job.id;

  const res = await fetch(
    `${API}/internal/runner/jobs/${encodeURIComponent(jobId)}/checkpoint`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch || {}),
    },
  );

  const text = await res.text();

  // v19.7.1 compatibility:
  // Missing checkpoint route should not kill the runner.
  if (res.status === 404 && text.includes("internal_runner_route_not_found")) {
    console.warn(
      `[checkpoint:fallback] checkpoint save skipped for ${jobId}; remote route missing`,
    );
    return null;
  }

  if (!res.ok) {
    throw new Error(
      `checkpoint POST failed for ${jobId}: ${res.status} ${text}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

function checkpointConfirmed(ck, statusField, requiredFields = []) {
  if (!ck || ck[statusField] !== "confirmed") return false;
  return requiredFields.every((field) => Boolean(ck[field]));
}

function remember(ck, values) {
  return Object.assign({}, ck || {}, values || {});
}

function retryableError(message) {
  return /Tx dropped|P2P|timeout|ETIMEDOUT|ECONNRESET|fetch failed|network|temporar|world state|reorg|PXE|node/i.test(
    String(message || ""),
  );
}

function jobPayload(job) {
  if (job.payload) return job.payload;
  const raw = job.payload_json || job.payloadJson;
  if (!raw) throw new Error(`Job ${job.id} has no payload`);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function executeCreate(job) {
  const p = jobPayload(job);
  const surveyKey = String(p.surveyKey);
  const policy = policyArgs(p);

  const rewardEnabledRaw = p.reward?.rewardEnabled;
  const isRewardEnabled =
    rewardEnabledRaw === true ||
    rewardEnabledRaw === 1 ||
    rewardEnabledRaw === "1" ||
    rewardEnabledRaw === "true";

  const rewardEnabled = isRewardEnabled ? "1" : "0";
  const rewardDisabled = !isRewardEnabled;

  const rewardPoolAmount = p.reward?.rewardPoolAmount || "0";
  const claimDeadline = p.reward?.claimDeadline || "9999999999";
  const startTime = String(p.startTime || "1");
  const endTime = String(p.endTime || "9999999999");
  if (BigInt(endTime) <= BigInt(startTime)) {
    throw new Error(
      `Invalid survey time range: endTime ${endTime} <= startTime ${startTime}`,
    );
  }
  const metadataHash = String(p.metadataHash || Number(surveyKey) + 2000);
  const policyHash = String(p.predicatePolicyHash || Number(surveyKey) + 1000);

  let ck = await getCheckpoint(job);

  const lastCheckpointError = () => String(ck.last_error || ck.lastError || "");
  const lastErrorSaysNotDeployed = (address) => {
    if (!address) return false;
    return lastCheckpointError().includes(
      `Contract ${address} is not deployed`,
    );
  };

  await saveCheckpoint(job, {
    flowStatus: "deploying",
    currentStep: ck.current_step || "create_started",
    retryable: false,
  });

  // Aztec testnet can reorg/stale-state after a tx was accepted.
  // If a later step says "Contract X is not deployed", do not trust the old checkpoint for X.
  if (lastErrorSaysNotDeployed(ck.factory_address)) {
    console.log(
      JSON.stringify(
        {
          recovery: "invalidate_factory_checkpoint_not_deployed",
          address: ck.factory_address,
        },
        null,
        2,
      ),
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "invalidate_factory_checkpoint",
      factoryStatus: "invalidated",
      factoryTxHash: null,
      factoryAddress: null,
      factoryRegisterStatus: "none",
      factoryRegisterTxHash: null,
    });
    ck = remember(ck, {
      factory_status: "invalidated",
      factory_tx_hash: null,
      factory_address: null,
      factory_register_status: "none",
      factory_register_tx_hash: null,
    });
  }

  if (lastErrorSaysNotDeployed(ck.gate_address)) {
    console.log(
      JSON.stringify(
        {
          recovery: "invalidate_gate_checkpoint_not_deployed",
          address: ck.gate_address,
        },
        null,
        2,
      ),
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "invalidate_gate_checkpoint",
      gateStatus: "invalidated",
      gateTxHash: null,
      gateAddress: null,
      policyStatus: "none",
      policyTxHash: null,
      policyRegistered: false,
      factoryRegisterStatus: "none",
      factoryRegisterTxHash: null,
    });
    ck = remember(ck, {
      gate_status: "invalidated",
      gate_tx_hash: null,
      gate_address: null,
      policy_status: "none",
      policy_tx_hash: null,
      policy_registered: 0,
      factory_register_status: "none",
      factory_register_tx_hash: null,
    });
  }

  if (!rewardDisabled && lastErrorSaysNotDeployed(ck.reward_address)) {
    console.log(
      JSON.stringify(
        {
          recovery: "invalidate_reward_checkpoint_not_deployed",
          address: ck.reward_address,
        },
        null,
        2,
      ),
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "invalidate_reward_checkpoint",
      rewardStatus: "invalidated",
      rewardTxHash: null,
      rewardAddress: null,
      rewardConfigStatus: "none",
      rewardConfigTxHash: null,
      factoryRegisterStatus: "none",
      factoryRegisterTxHash: null,
    });
    ck = remember(ck, {
      reward_status: "invalidated",
      reward_tx_hash: null,
      reward_address: null,
      reward_config_status: "none",
      reward_config_tx_hash: null,
      factory_register_status: "none",
      factory_register_tx_hash: null,
    });
  }

  if (lastErrorSaysNotDeployed(ck.core_address)) {
    console.log(
      JSON.stringify(
        {
          recovery: "invalidate_core_checkpoint_not_deployed",
          address: ck.core_address,
        },
        null,
        2,
      ),
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "invalidate_core_checkpoint",
      coreStatus: "invalidated",
      coreTxHash: null,
      coreAddress: null,
      factoryRegisterStatus: "none",
      factoryRegisterTxHash: null,
    });
    ck = remember(ck, {
      core_status: "invalidated",
      core_tx_hash: null,
      core_address: null,
      factory_register_status: "none",
      factory_register_tx_hash: null,
    });
  }

  let factory;
  if (checkpointConfirmed(ck, "factory_status", ["factory_address"])) {
    factory = { address: ck.factory_address, tx: ck.factory_tx_hash };
    console.log(
      JSON.stringify(
        {
          recovery: "skip_factory_deploy",
          address: factory.address,
          tx: factory.tx,
        },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "deploy_factory",
      factoryStatus: "started",
    });
    factory = await deploy(
      ARTIFACTS.factory,
      `dscope_factory_${surveyKey}_${Date.now()}`,
      [FROM, FROM],
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "deploy_factory",
      factoryStatus: "confirmed",
      factoryTxHash: factory.tx,
      factoryAddress: factory.address,
    });
    ck = remember(ck, {
      factory_status: "confirmed",
      factory_tx_hash: factory.tx,
      factory_address: factory.address,
    });
  }

  let gate;
  if (checkpointConfirmed(ck, "gate_status", ["gate_address"])) {
    gate = { address: ck.gate_address, tx: ck.gate_tx_hash };
    console.log(
      JSON.stringify(
        { recovery: "skip_gate_deploy", address: gate.address, tx: gate.tx },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "deploy_gate",
      gateStatus: "started",
    });
    gate = await deploy(
      ARTIFACTS.gate,
      `dscope_gate_${surveyKey}_${Date.now()}`,
      [FROM],
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "deploy_gate",
      gateStatus: "confirmed",
      gateTxHash: gate.tx,
      gateAddress: gate.address,
    });
    ck = remember(ck, {
      gate_status: "confirmed",
      gate_tx_hash: gate.tx,
      gate_address: gate.address,
    });
  }

  let reward = null;
  let registerRewardTx = null;

  if (rewardDisabled) {
    console.log(
      JSON.stringify(
        { recovery: "skip_reward_disabled", rewardEnabled, surveyKey },
        null,
        2,
      ),
    );
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "reward_disabled_skip",
      rewardStatus: "skipped",
      rewardTxHash: null,
      rewardAddress: null,
      rewardConfigStatus: "skipped",
      rewardConfigTxHash: null,
    });
    ck = remember(ck, {
      reward_status: "skipped",
      reward_tx_hash: null,
      reward_address: null,
      reward_config_status: "skipped",
      reward_config_tx_hash: null,
    });
  } else {
    if (checkpointConfirmed(ck, "reward_status", ["reward_address"])) {
      reward = { address: ck.reward_address, tx: ck.reward_tx_hash };
      console.log(
        JSON.stringify(
          {
            recovery: "skip_reward_deploy",
            address: reward.address,
            tx: reward.tx,
          },
          null,
          2,
        ),
      );
    } else {
      await saveCheckpoint(job, {
        flowStatus: "deploying",
        currentStep: "deploy_reward",
        rewardStatus: "started",
      });
      reward = await deploy(
        ARTIFACTS.reward,
        `dscope_reward_${surveyKey}_${Date.now()}`,
        [FROM],
      );
      await saveCheckpoint(job, {
        flowStatus: "deploying",
        currentStep: "deploy_reward",
        rewardStatus: "confirmed",
        rewardTxHash: reward.tx,
        rewardAddress: reward.address,
      });
      ck = remember(ck, {
        reward_status: "confirmed",
        reward_tx_hash: reward.tx,
        reward_address: reward.address,
      });
    }
  }

  let registerWindowTx = null;
  let registerPolicyTx;
  if (
    ck.policy_status === "confirmed" ||
    ck.policy_registered === 1 ||
    ck.policy_registered === true
  ) {
    registerPolicyTx = ck.policy_tx_hash;
    console.log(
      JSON.stringify(
        { recovery: "skip_policy_register", tx: registerPolicyTx },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "register_survey_window",
      policyStatus: "started",
      policyHash,
    });

    registerWindowTx = await send(
      "register_survey_window",
      gate.address,
      ARTIFACTS.gate,
      [surveyKey, startTime, endTime],
    );

    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "register_policy",
      policyStatus: "started",
      policyHash,
    });

    registerPolicyTx = await send(
      "register_survey_policy",
      gate.address,
      ARTIFACTS.gate,
      [
        surveyKey,
        policyHash,
        policy.ageMode,
        policy.ageMask,
        policy.countryMode,
        policy.countryBitmap,
      ],
    );

    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "register_policy",
      policyStatus: "confirmed",
      policyTxHash: registerPolicyTx,
      policyHash,
      policyRegistered: true,
    });
    ck = remember(ck, {
      policy_status: "confirmed",
      policy_tx_hash: registerPolicyTx,
      policy_hash: policyHash,
      policy_registered: 1,
    });
  }

  if (!rewardDisabled) {
    if (ck.reward_config_status === "confirmed") {
      registerRewardTx = ck.reward_config_tx_hash;
      console.log(
        JSON.stringify(
          { recovery: "skip_reward_config", tx: registerRewardTx },
          null,
          2,
        ),
      );
    } else {
      await saveCheckpoint(job, {
        flowStatus: "deploying",
        currentStep: "register_reward_config",
        rewardConfigStatus: "started",
      });

      registerRewardTx = await send(
        "register_reward_config",
        reward.address,
        ARTIFACTS.reward,
        [surveyKey, rewardEnabled, rewardPoolAmount, claimDeadline],
      );

      await saveCheckpoint(job, {
        flowStatus: "deploying",
        currentStep: "register_reward_config",
        rewardConfigStatus: "confirmed",
        rewardConfigTxHash: registerRewardTx,
      });
      ck = remember(ck, {
        reward_config_status: "confirmed",
        reward_config_tx_hash: registerRewardTx,
      });
    }
  }

  let core;
  if (checkpointConfirmed(ck, "core_status", ["core_address"])) {
    core = { address: ck.core_address, tx: ck.core_tx_hash };
    console.log(
      JSON.stringify(
        { recovery: "skip_core_deploy", address: core.address, tx: core.tx },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "deploy_core",
      coreStatus: "started",
    });

    core = await deploy(
      ARTIFACTS.core,
      `dscope_core_${surveyKey}_${Date.now()}`,
      [
        FROM,
        FROM,
        FROM,
        gate.address,
        surveyKey,
        metadataHash,
        policyHash,
        startTime,
        endTime,
        rewardPoolAmount,
        claimDeadline,
        rewardEnabled,
        "1",
        "1",
        "1",
        "1",
      ],
    );

    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "deploy_core",
      coreStatus: "confirmed",
      coreTxHash: core.tx,
      coreAddress: core.address,
    });
    ck = remember(ck, {
      core_status: "confirmed",
      core_tx_hash: core.tx,
      core_address: core.address,
    });
  }

  let factoryRegisterTx;
  if (ck.factory_register_status === "confirmed") {
    factoryRegisterTx = ck.factory_register_tx_hash;
    console.log(
      JSON.stringify(
        { recovery: "skip_factory_register", tx: factoryRegisterTx },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "factory_register_survey",
      factoryRegisterStatus: "started",
    });

    const createdAt = Math.floor(Date.now() / 1000);
    const rewardAddressForFactory = rewardDisabled ? FROM : reward.address;

    factoryRegisterTx = await send(
      "register_survey_with_config",
      factory.address,
      ARTIFACTS.factory,
      [
        surveyKey,
        core.address,
        gate.address,
        rewardAddressForFactory,
        policyHash,
        FROM,
        metadataHash,
        startTime,
        endTime,
        FROM,
        String(createdAt),
      ],
    );

    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "factory_register_survey",
      factoryRegisterStatus: "confirmed",
      factoryRegisterTxHash: factoryRegisterTx,
    });
    ck = remember(ck, {
      factory_register_status: "confirmed",
      factory_register_tx_hash: factoryRegisterTx,
    });
  }

  const txHashes = {
    deploySurveyFactory: factory.tx,
    deployParticipationGate: gate.tx,
    registerSurveyWindow: registerWindowTx,
    registerSurveyPolicy: registerPolicyTx,
    deployRewardVault: rewardDisabled ? null : reward.tx,
    registerRewardConfig: rewardDisabled ? null : registerRewardTx,
    deployDscopeCore: core.tx,
    factoryRegisterSurveyWithConfig: factoryRegisterTx,
  };

  const contracts = {
    surveyFactoryAddress: factory.address,
    dscopeCoreAddress: core.address,
    participationGateAddress: gate.address,
    rewardVaultAddress: rewardDisabled ? null : reward.address,
  };

  if (ck.flow_status === "active") {
    console.log(
      JSON.stringify(
        { recovery: "skip_create_complete", surveyId: p.surveyId },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "deploying",
      currentStep: "create_complete_backend",
    });

    await postJson(`/internal/runner/surveys/${p.surveyId}/create-complete`, {
      status: "active",
      chainMode: "aztec-testnet-cli-runner",
      rewardStatus: rewardDisabled ? "DISABLED" : "CONFIGURED",
      contracts,
      txHashes,
      policy: {
        ageMode: policy.ageMode,
        ageMask: policy.ageMask,
        countryMode: policy.countryMode,
        countryBitmap: policy.countryBitmapArray,
        source: "testnet_cli_runner_once",
      },
      reads: {
        runnerId: RUNNER_ID,
        nodeUrl: NODE_URL,
        surveyKey,
      },
      runnerOutput: {
        chainMode: "aztec-testnet-cli-runner",
        surveyId: p.surveyId,
        surveyKey,
        contracts,
        txHashes,
        rewardDisabled,
      },
    });

    await saveCheckpoint(job, {
      flowStatus: "active",
      currentStep: "active",
      outputsJson: JSON.stringify({ contracts, txHashes, rewardDisabled }),
    });
  }

  return { contracts, txHashes };
}

async function executeFinalize(job) {
  const p = jobPayload(job);
  const surveyKey = String(p.surveyKey);

  let ck = await getCheckpoint(job);
  await saveCheckpoint(job, {
    flowStatus: "finalizing",
    currentStep: "finalize_started",
    retryable: false,
  });

  // v19.6.3:
  // Use fresh wall-clock time on every finalize retry.
  // Early finalize requests may be retried after the survey end time.
  const nowSec = Math.floor(Date.now() / 1000);
  const finalizedAt = String(nowSec);
  const currentTime = String(nowSec);

  const rawRewardVaultAddress =
    p.rewardVaultAddress || p.contracts?.rewardVaultAddress || null;

  const isRealAztecAddress = (value) =>
    typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

  const rewardVaultAddress = isRealAztecAddress(rawRewardVaultAddress)
    ? rawRewardVaultAddress
    : null;

  const rewardEnabledRaw =
    p.rewardEnabled ?? p.reward?.rewardEnabled ?? p.rewardStatus ?? null;

  const rewardDisabled =
    !rewardVaultAddress ||
    rawRewardVaultAddress === "0xREWARD_VAULT_PENDING" ||
    rewardEnabledRaw === false ||
    rewardEnabledRaw === 0 ||
    rewardEnabledRaw === "0" ||
    String(rewardEnabledRaw || "").toUpperCase() === "DISABLED";

  const rewardPoolAmount = String(
    p.rewardPoolAmount || p.reward?.rewardPoolAmount || "0",
  );
  const claimDeadline = String(
    p.claimDeadline || p.reward?.claimDeadline || "0",
  );

  // v19.5:
  // Do NOT call ParticipationGateV2.get_survey_participation_count via aztec-wallet simulate here.
  // On Aztec v5 this can hit sync_state/oracle callback issues in CLI simulation.
  // For current smoke/finalize path we use payload/backend fallback.
  const incomingAnalyticsPayload =
    p.analyticsPayload && typeof p.analyticsPayload === "object"
      ? p.analyticsPayload
      : null;

  const finalParticipantCount = String(
    p.finalParticipantCount ??
      p.final_participant_count ??
      p.participantCount ??
      p.participationCount ??
      p.totalValidParticipants ??
      incomingAnalyticsPayload?.totalValidParticipants ??
      0,
  );

  console.log(
    JSON.stringify(
      {
        finalize: "using_payload_or_zero_participation_count",
        surveyId: p.surveyId,
        surveyKey,
        finalParticipantCount,
        reason: "skip_gate_simulate_v19_5",
      },
      null,
      2,
    ),
  );

  await saveCheckpoint(job, {
    flowStatus: "finalizing",
    currentStep: "build_finalize_payload",
    finalParticipantCount,
  });

  const analyticsPayload = incomingAnalyticsPayload || {
    version: 1,
    kind: "dscope_survey_analytics_mvp",
    surveyKey,
    totalRecords: Number(finalParticipantCount),
    totalValidParticipants: Number(finalParticipantCount),
    byAgeBucket: {},
    byCountry: {},
    byRegion: {},
    answerTotals: {},
    privacy: {
      minTotalSample: 10,
      minSegmentSample: 5,
      flags: {
        totalSampleTooSmall:
          Number(finalParticipantCount) > 0 &&
          Number(finalParticipantCount) < 10,
        suppressedAgeBuckets: [],
        suppressedCountries: [],
        suppressedRegions: [],
      },
    },
  };

  const rewardAccounting = {
    status: rewardDisabled ? "disabled" : "finalized",
    rewardEnabled: !rewardDisabled,
    rewardPoolAmount,
    finalParticipantCount,
    rewardPerParticipant: "0",
    totalAllocated: "0",
    dustReturnToSponsor: rewardDisabled ? rewardPoolAmount : "0",
    claimDeadline,
    finalizedAt,
  };

  const rewardDistributionPayload = {
    version: 1,
    kind: "dscope_reward_distribution_mvp",
    surveyKey,
    policyHash: String(p.policyHash || p.predicatePolicyHash || "0"),
    finalParticipantCount,
    rewardAccounting,
  };

  const resultHash = computeMvpNumericHash(analyticsPayload);
  const distributionHash = computeMvpNumericHash(rewardDistributionPayload);

  let finalizeRewardTx = null;

  if (rewardDisabled) {
    console.log(
      JSON.stringify(
        {
          finalize: "skip_reward_finalize_disabled",
          surveyId: p.surveyId,
          surveyKey,
          rewardVaultAddress,
        },
        null,
        2,
      ),
    );

    await saveCheckpoint(job, {
      flowStatus: "finalizing",
      currentStep: "reward_finalize_skipped",
      finalizeRewardStatus: "skipped",
      finalizeRewardTxHash: null,
    });

    ck = remember(ck, {
      finalize_reward_status: "skipped",
      finalize_reward_tx_hash: null,
    });
  } else {
    if (ck.finalize_reward_status === "confirmed") {
      finalizeRewardTx = ck.finalize_reward_tx_hash;
      console.log(
        JSON.stringify(
          { recovery: "skip_finalize_reward", tx: finalizeRewardTx },
          null,
          2,
        ),
      );
    } else {
      await saveCheckpoint(job, {
        flowStatus: "finalizing",
        currentStep: "finalize_reward_distribution",
        finalizeRewardStatus: "started",
      });

      finalizeRewardTx = await send(
        "finalize_reward_distribution",
        rewardVaultAddress,
        ARTIFACTS.reward,
        [surveyKey, finalParticipantCount, distributionHash, finalizedAt],
      );

      await saveCheckpoint(job, {
        flowStatus: "finalizing",
        currentStep: "finalize_reward_distribution",
        finalizeRewardStatus: "confirmed",
        finalizeRewardTxHash: finalizeRewardTx,
      });

      ck = remember(ck, {
        finalize_reward_status: "confirmed",
        finalize_reward_tx_hash: finalizeRewardTx,
      });
    }
  }

  let finalizeCoreTx;

  if (ck.finalize_core_status === "confirmed") {
    finalizeCoreTx = ck.finalize_core_tx_hash;
    console.log(
      JSON.stringify(
        { recovery: "skip_finalize_core", tx: finalizeCoreTx },
        null,
        2,
      ),
    );
  } else {
    await saveCheckpoint(job, {
      flowStatus: "finalizing",
      currentStep: "finalize_core",
      finalizeCoreStatus: "started",
      resultHash,
      distributionHash,
    });

    finalizeCoreTx = await send(
      "finalize_results",
      p.dscopeCoreAddress,
      ARTIFACTS.core,
      [
        resultHash,
        distributionHash,
        finalParticipantCount,
        finalizedAt,
        currentTime,
      ],
    );

    await saveCheckpoint(job, {
      flowStatus: "finalizing",
      currentStep: "finalize_core",
      finalizeCoreStatus: "confirmed",
      finalizeCoreTxHash: finalizeCoreTx,
      resultHash,
      distributionHash,
    });

    ck = remember(ck, {
      finalize_core_status: "confirmed",
      finalize_core_tx_hash: finalizeCoreTx,
      result_hash: resultHash,
      distribution_hash: distributionHash,
    });
  }

  await saveCheckpoint(job, {
    flowStatus: "finalizing",
    currentStep: "finalize_complete_backend",
  });

  await postJson(`/internal/runner/surveys/${p.surveyId}/finalize-complete`, {
    status: "finalized",
    result: {
      resultHash,
      distributionHash,
      finalParticipantCount,
      analyticsPayload,
      rewardPayload: rewardAccounting,
      finalizationPayload: {
        source: "testnet_cli_runner_once",
        chainMode: "aztec-testnet-cli-runner",
        txHashes: {
          finalizeRewardDistribution: finalizeRewardTx,
          finalizeDscopeCore: finalizeCoreTx,
        },
      },
    },
    reward: {
      rewardStatus: rewardDisabled ? "DISABLED" : "FINALIZED",
      rewardPerParticipant: "0",
      totalAllocated: "0",
      dustReturnToSponsor: rewardAccounting.dustReturnToSponsor,
      distributionHash,
      finalizedAt: new Date(Number(finalizedAt) * 1000).toISOString(),
    },
  });

  await saveCheckpoint(job, {
    flowStatus: "finalized",
    currentStep: "finalized",
    outputsJson: JSON.stringify({
      finalParticipantCount,
      resultHash,
      distributionHash,
      txHashes: {
        finalizeRewardDistribution: finalizeRewardTx,
        finalizeDscopeCore: finalizeCoreTx,
      },
    }),
  });

  return {
    finalParticipantCount,
    resultHash,
    distributionHash,
    txHashes: {
      finalizeRewardDistribution: finalizeRewardTx,
      finalizeDscopeCore: finalizeCoreTx,
    },
  };
}

async function main() {
  assertEnv();
  console.log(
    JSON.stringify({ runnerId: RUNNER_ID, API, NODE_URL, FROM }, null, 2),
  );
  await postHeartbeat("starting");

  const claimed = await claimNextJob();
  const job = claimed.job;
  if (!job) {
    console.log("No pending job.");
    await postHeartbeat("idle", { pendingJob: false });
    return;
  }

  console.log(
    JSON.stringify(
      {
        pickedJob: {
          id: job.id,
          type: job.type,
          survey: job.surveyId || job.survey_id,
          key: job.surveyKey || job.survey_key,
        },
      },
      null,
      2,
    ),
  );
  await postHeartbeat("running", {
    jobId: job.id,
    jobType: job.type,
    surveyId: job.surveyId || job.survey_id || null,
    surveyKey: job.surveyKey || job.survey_key || null,
  });

  try {
    let output;
    if (job.type === "create_survey_mvp") output = await executeCreate(job);
    else if (job.type === "finalize_survey_mvp")
      output = await executeFinalize(job);
    else throw new Error(`Unsupported job type ${job.type}`);

    await markDone(job.id, [
      event(
        job.id,
        "runner.testnet_cli_done",
        "Aztec testnet CLI runner completed job",
        { output },
      ),
    ]);

    await postHeartbeat("ok", { jobId: job.id, jobType: job.type, output });
    console.log(JSON.stringify({ ok: true, jobId: job.id, output }, null, 2));
  } catch (err) {
    const message =
      err instanceof Error ? err.stack || err.message : String(err);
    try {
      await saveCheckpoint(job, {
        flowStatus: retryableError(message) ? "retryable_failed" : "failed",
        lastError: message,
        retryable: retryableError(message),
      });
    } catch (checkpointErr) {
      console.error(
        "checkpoint failure update failed:",
        checkpointErr instanceof Error
          ? checkpointErr.message
          : String(checkpointErr),
      );
    }

    await markFailed(job.id, message, [
      event(
        job.id,
        "runner.testnet_cli_failed",
        "Aztec testnet CLI runner failed job",
        { error: message },
      ),
    ]);
    await postHeartbeat("failed", {
      jobId: job.id,
      jobType: job.type,
      error: message,
    });
    console.error(message);
    process.exit(1);
  }
}

main();
