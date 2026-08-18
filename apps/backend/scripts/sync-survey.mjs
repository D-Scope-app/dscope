import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8787";
const AZTEC_NODE_URL =
  process.env.AZTEC_NODE_URL || "https://v4-devnet-2.aztec-labs.com/";
const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:my-wallet";
const AZTEC_CONTRACT_ARTIFACT =
  process.env.AZTEC_CONTRACT_ARTIFACT ||
  dscopeFileURLToPath(new URL("../../../contracts/dscope_core/target/dscope_core-DScopeCore.json", import.meta.url));

function extractSimulationResult(output) {
  const match = output.match(/Simulation result:\s*(.+)/);
  if (!match) {
    throw new Error(
      `Could not parse simulation result from output:\n${output}`,
    );
  }
  return match[1].trim();
}

function normalizeValue(raw) {
  return raw.replace(/n$/, "").trim();
}

function parseAztecAddress(raw) {
  const match = raw.match(/AztecAddress<([^>]+)>/);
  return match ? match[1].trim() : raw.trim();
}

async function runSimulate(contractAddress, functionName) {
  const args = [
    "simulate",
    functionName,
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    contractAddress,
    "--contract-artifact",
    AZTEC_CONTRACT_ARTIFACT,
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024,
  });

  const combined = `${stdout}\n${stderr}`;
  return extractSimulationResult(combined);
}

async function main() {
  const surveyId = process.argv[2];

  if (!surveyId) {
    throw new Error("Usage: node scripts/sync-survey.mjs <survey-id>");
  }

  const surveyRes = await fetch(`${BACKEND_URL}/surveys/${surveyId}`);
  const surveyJson = await surveyRes.json();

  if (!surveyRes.ok || !surveyJson.ok) {
    throw new Error(
      `Failed to load survey: ${JSON.stringify(surveyJson, null, 2)}`,
    );
  }

  const survey = surveyJson.survey;
  const contractAddress = survey.contract_address;

  const sponsorRaw = await runSimulate(contractAddress, "get_sponsor");
  const finalizerRaw = await runSimulate(
    contractAddress,
    "get_system_finalizer",
  );
  const statusRaw = await runSimulate(contractAddress, "get_status");
  const resultHashRaw = await runSimulate(contractAddress, "get_result_hash");
  const distributionHashRaw = await runSimulate(
    contractAddress,
    "get_distribution_hash",
  );
  const finalParticipantCountRaw = await runSimulate(
    contractAddress,
    "get_final_participant_count",
  );
  const finalizedAtRaw = await runSimulate(contractAddress, "get_finalized_at");

  const sponsor = parseAztecAddress(sponsorRaw);
  const systemFinalizer = parseAztecAddress(finalizerRaw);
  const onchainStatus = normalizeValue(statusRaw);
  const resultHash = normalizeValue(resultHashRaw);
  const distributionHash = normalizeValue(distributionHashRaw);
  const finalParticipantCount = normalizeValue(finalParticipantCountRaw);
  const finalizedAt = normalizeValue(finalizedAtRaw);

  let mappedStatus = "active";
  if (onchainStatus === "2") mappedStatus = "finalized";
  if (onchainStatus === "3") mappedStatus = "cancelled";

  const payload = {
    sponsor,
    systemFinalizer,
    status: mappedStatus,
    resultHash: resultHash === "0" ? null : resultHash,
    distributionHash: distributionHash === "0" ? null : distributionHash,
    finalParticipantCount:
      finalParticipantCount === "0" ? null : finalParticipantCount,
    finalizedAt: finalizedAt === "0" ? null : Number(finalizedAt),
  };

  const applyRes = await fetch(
    `${BACKEND_URL}/surveys/${surveyId}/apply-sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const applyJson = await applyRes.json();

  if (!applyRes.ok || !applyJson.ok) {
    throw new Error(
      `Failed to apply sync: ${JSON.stringify(applyJson, null, 2)}`,
    );
  }

  console.log(JSON.stringify(applyJson, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
