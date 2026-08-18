import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const HOST = process.env.ISSUER_HOST || "127.0.0.1";
const PORT = Number(process.env.ISSUER_PORT || "8790");
const ISSUER_API_TOKEN = process.env.ISSUER_API_TOKEN || "";

if (!ISSUER_API_TOKEN) {
  console.error("ISSUER_API_TOKEN is required");
  process.exit(1);
}

function issuerPaymentArgs() {
  const explicitPayment =
    process.env.AZTEC_PAYMENT || process.env.PAYMENT || "";

  if (explicitPayment) {
    return ["--payment", explicitPayment];
  }

  const fpc =
    process.env.AZTEC_FPC_ADDRESS ||
    process.env.FPC_ADDRESS ||
    process.env.SPONSORED_FPC_ADDRESS ||
    process.env.FPC ||
    "";

  if (fpc) {
    return ["--payment", `method=fpc-sponsored,fpc=${fpc}`];
  }

  return [];
}

const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || "http://localhost:8080";
const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:test0";
const AZTEC_WALLET_DATA_DIR =
  process.env.AZTEC_WALLET_DATA_DIR || process.env.WALLET_DATA_DIR || "";
const PARTICIPATION_GATE_ADDRESS = process.env.PARTICIPATION_GATE_ADDRESS || "";

function withWalletDataDir(args) {
  return AZTEC_WALLET_DATA_DIR
    ? ["--data-dir", AZTEC_WALLET_DATA_DIR, ...args]
    : args;
}

const AZTEC_PARTICIPATION_GATE_ARTIFACT =
  process.env.AZTEC_PARTICIPATION_GATE_ARTIFACT ||
  dscopeFileURLToPath(new URL("../../../contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json", import.meta.url));

const PREDICATE_CODES_PATH =
  process.env.PREDICATE_CODES_PATH ||
  dscopeFileURLToPath(new URL("../src/domain/predicate/predicate-codes.v1.json", import.meta.url));

const DEFAULT_VALID_UNTIL = process.env.DEFAULT_VALID_UNTIL || "999999";
const DEFAULT_SOURCE_TAG = process.env.DEFAULT_SOURCE_TAG || "1";
const DEFAULT_CREDENTIAL_VERSION =
  process.env.DEFAULT_CREDENTIAL_VERSION || "2";

function isAuthorizedIssuerRequest(req) {
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${ISSUER_API_TOKEN}`;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

function requireValue(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required value: ${name}`);
  }
  return String(value).trim();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(
          new Error(
            `Invalid JSON body: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
    req.on("error", reject);
  });
}

function normalizeAgeBucketLabel(codes, input) {
  const raw = String(input || "").trim();
  if (codes.ageBucketAliases[raw]) return codes.ageBucketAliases[raw];

  const normalized = raw.toLowerCase().replace(/\s+/g, "").replace("-", "_");
  return codes.ageBucketAliases[normalized] || "other_unknown";
}

function ageBucketFromBirthdate(birthdate, now = new Date()) {
  const date = new Date(birthdate);
  if (Number.isNaN(date.getTime())) return "other_unknown";

  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  const dayDiff = now.getUTCDate() - date.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

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

function ageBucketBitIndex(ageBucket) {
  const map = {
    "18_25": "0",
    "26_30": "1",
    "31_35": "2",
    "36_45": "3",
    "46_50": "4",
    "51_55": "5",
    "56_60": "6",
    "61_plus": "7",
    other_unknown: "63",
  };

  return map[ageBucket] || "63";
}

function normalizeCountryAlpha2(codes, input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase();

  if (codes.countryNumericCodes[raw]) return raw;
  if (codes.countryAlpha3ToAlpha2[raw]) return codes.countryAlpha3ToAlpha2[raw];

  return "OTHER_UNKNOWN";
}

function normalizePredicate(codes, payload) {
  const ageBucket = payload.ageBucket
    ? normalizeAgeBucketLabel(codes, payload.ageBucket)
    : payload.birthdate
      ? ageBucketFromBirthdate(payload.birthdate)
      : "other_unknown";

  const countryAlpha2 = normalizeCountryAlpha2(
    codes,
    requireValue("country", payload.country),
  );
  const worldRegion = payload.worldRegion
    ? String(payload.worldRegion).trim().toUpperCase()
    : codes.countryRegion[countryAlpha2] || "OTHER_UNKNOWN";

  return {
    ageBucket,
    ageBucketCode: ageBucketBitIndex(ageBucket),
    countryAlpha2,
    countryCode:
      codes.countryNumericCodes[countryAlpha2]?.fieldCode ||
      codes.contractSemantics.otherUnknown,
    worldRegion,
    worldRegionCode:
      codes.regionCodes[worldRegion] || codes.contractSemantics.otherUnknown,
  };
}

function extractTransactionHash(output) {
  const match = output.match(/Transaction hash:\s*(0x[a-fA-F0-9]+)/);
  if (!match) {
    throw new Error(`Could not parse transaction hash from output:\n${output}`);
  }
  return match[1];
}

async function issueCredential(payload) {
  const participationGateAddress = requireValue(
    "participationGateAddress or PARTICIPATION_GATE_ADDRESS env",
    payload.participationGateAddress ||
      payload.participationGate ||
      payload.gateAddress ||
      PARTICIPATION_GATE_ADDRESS,
  );

  const to = requireValue(
    "to",
    payload.to || payload.walletAddress || payload.aztecAddress,
  );
  const codes = JSON.parse(await readFile(PREDICATE_CODES_PATH, "utf8"));
  const normalized = normalizePredicate(codes, payload);

  if (normalized.ageBucketCode === codes.contractSemantics.otherUnknown) {
    throw new Error(
      "Cannot issue credential: age bucket normalized to OTHER_UNKNOWN",
    );
  }

  if (normalized.countryCode === codes.contractSemantics.otherUnknown) {
    throw new Error(
      "Cannot issue credential: country normalized to OTHER_UNKNOWN",
    );
  }

  if (normalized.worldRegionCode === codes.contractSemantics.otherUnknown) {
    throw new Error(
      "Cannot issue credential: world region normalized to OTHER_UNKNOWN",
    );
  }

  const validUntil = String(payload.validUntil ?? DEFAULT_VALID_UNTIL);
  const sourceTag = String(payload.sourceTag ?? DEFAULT_SOURCE_TAG);
  const credentialVersion = String(
    payload.credentialVersion ?? DEFAULT_CREDENTIAL_VERSION,
  );

  const args = [
    "send",
    "store_credential",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    ...issuerPaymentArgs(),
    "--contract-address",
    participationGateAddress,
    "--contract-artifact",
    AZTEC_PARTICIPATION_GATE_ARTIFACT,
    "--args",
    to,
    normalized.ageBucketCode,
    normalized.countryCode,
    normalized.worldRegionCode,
    validUntil,
    sourceTag,
    credentialVersion,
  ];

  const walletArgs = withWalletDataDir(args);

  const { stdout, stderr } = await execFileAsync("aztec-wallet", walletArgs, {
    maxBuffer: 1024 * 1024 * 10,
  });

  const output = `${stdout}\n${stderr}`;
  const txHash = extractTransactionHash(output);

  return {
    ok: true,
    txHash,
    participationGateAddress,
    issuer: AZTEC_FROM_ALIAS,
    to,
    normalized,
    credential: {
      ageBucketCode: normalized.ageBucketCode,
      countryCode: normalized.countryCode,
      worldRegionCode: normalized.worldRegionCode,
      validUntil,
      sourceTag,
      credentialVersion,
    },
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || `${HOST}:${PORT}`}`,
    );

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "dscope-issuer-service",
        aztecNodeUrl: AZTEC_NODE_URL,
        issuer: AZTEC_FROM_ALIAS,
        walletDataDir: AZTEC_WALLET_DATA_DIR || null,
        participationGateAddress: PARTICIPATION_GATE_ADDRESS || null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/issuer/issue-credential") {
      if (!isAuthorizedIssuerRequest(req)) {
        sendJson(res, 401, {
          ok: false,
          error: "Unauthorized issuer request",
        });
        return;
      }

      const payload = await readJsonBody(req);
      const result = await issueCredential(payload);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: "Not found",
      routes: ["GET /health", "POST /issuer/issue-credential"],
    });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`D-Scope issuer service listening on http://${HOST}:${PORT}`);
});
