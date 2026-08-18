import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8787";
const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || "http://localhost:8080";
const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:test0";

const AZTEC_CONTRACT_ARTIFACT =
  process.env.AZTEC_CONTRACT_ARTIFACT ||
  dscopeFileURLToPath(new URL("../../../contracts/dscope_core/target/dscope_core-DScopeCore.json", import.meta.url));

const AZTEC_FACTORY_ARTIFACT =
  process.env.AZTEC_FACTORY_ARTIFACT ||
  dscopeFileURLToPath(new URL("../../../contracts/survey_factory/target/survey_factory-SurveyFactory.json", import.meta.url));

const MAX_ERROR_LENGTH = 2000;

function truncateError(message) {
  if (!message) return null;
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH)}... [truncated]`
    : message;
}

function extractContractAddress(output) {
  const match = output.match(/Contract deployed at\s+(0x[a-fA-F0-9]+)/);
  if (!match) {
    throw new Error(
      `Could not parse deployed contract address from output:\n${output}`,
    );
  }
  return match[1];
}

function extractDeploymentTxHash(output) {
  const match = output.match(/Deployment tx hash:\s*(0x[a-fA-F0-9]+)/);
  if (!match) {
    throw new Error(
      `Could not parse deployment tx hash from output:\n${output}`,
    );
  }
  return match[1];
}

function extractTransactionHash(output) {
  const match = output.match(/Transaction hash:\s*(0x[a-fA-F0-9]+)/);
  if (!match) {
    throw new Error(`Could not parse transaction hash from output:\n${output}`);
  }
  return match[1];
}

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

function normalizeBool(raw) {
  const value = raw.trim().toLowerCase();
  return value === "true";
}

async function updateJobStatus(jobId, status, lastError = null) {
  const res = await fetch(`${BACKEND_URL}/jobs/${jobId}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status,
      lastError,
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(
      `Failed to update job status: ${JSON.stringify(json, null, 2)}`,
    );
  }

  return json;
}

async function updateCreateStatus(surveyId, payload) {
  const res = await fetch(`${BACKEND_URL}/surveys/${surveyId}/create-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(
      `Failed to update create status: ${JSON.stringify(json, null, 2)}`,
    );
  }

  return json;
}

async function loadSurvey(surveyId) {
  const surveyRes = await fetch(`${BACKEND_URL}/surveys/${surveyId}`);
  const surveyJson = await surveyRes.json();

  if (!surveyRes.ok || !surveyJson.ok) {
    throw new Error(
      `Failed to load survey: ${JSON.stringify(surveyJson, null, 2)}`,
    );
  }

  return surveyJson.survey;
}

async function findCreateJob(surveyId) {
  const res = await fetch(`${BACKEND_URL}/surveys/${surveyId}/jobs`);
  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(`Failed to load jobs: ${JSON.stringify(json, null, 2)}`);
  }

  const job = (json.jobs || [])
    .filter((j) => j.job_type === "create_survey")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .at(-1);

  if (!job) {
    throw new Error(`No create_survey job found for survey '${surveyId}'`);
  }

  return job;
}

async function runDeploySurvey(survey, alias) {
  const args = [
    "deploy",
    AZTEC_CONTRACT_ARTIFACT,
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--args",
    survey.sponsor,
    survey.treasury,
    survey.system_finalizer,
    survey.metadata_hash,
    survey.predicate_policy_hash,
    String(survey.start_time),
    String(survey.end_time),
    survey.reward_pool_amount,
    survey.claim_deadline,
    survey.reward_enabled,
    survey.minimum_sample_target,
    "-a",
    alias,
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024,
  });

  return `${stdout}\n${stderr}`;
}

async function runRegisterSurvey(
  factoryAddress,
  contractAddress,
  sponsor,
  createdAt,
) {
  const args = [
    "send",
    "register_survey",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    factoryAddress,
    "--contract-artifact",
    AZTEC_FACTORY_ARTIFACT,
    "--args",
    contractAddress,
    sponsor,
    String(createdAt),
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024,
  });

  return `${stdout}\n${stderr}`;
}

async function runGetSurveyIdByAddress(factoryAddress, contractAddress) {
  const args = [
    "simulate",
    "get_survey_id_by_address",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    factoryAddress,
    "--contract-artifact",
    AZTEC_FACTORY_ARTIFACT,
    "--args",
    contractAddress,
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024,
  });

  const combined = `${stdout}\n${stderr}`;
  return normalizeValue(extractSimulationResult(combined));
}

async function runIsRegistered(factoryAddress, contractAddress) {
  const args = [
    "simulate",
    "is_registered",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    factoryAddress,
    "--contract-artifact",
    AZTEC_FACTORY_ARTIFACT,
    "--args",
    contractAddress,
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024,
  });

  const combined = `${stdout}\n${stderr}`;
  return normalizeBool(extractSimulationResult(combined));
}

async function ensureRegistryId(survey) {
  if (survey.registry_id && String(survey.registry_id).trim().length > 0) {
    return String(survey.registry_id);
  }

  if (!survey.contract_address || !survey.factory_address) {
    return null;
  }

  const registered = await runIsRegistered(
    survey.factory_address,
    survey.contract_address,
  );

  if (!registered) {
    return null;
  }

  return await runGetSurveyIdByAddress(
    survey.factory_address,
    survey.contract_address,
  );
}

async function main() {
  const surveyId = process.argv[2];

  if (!surveyId) {
    throw new Error("Usage: node scripts/create-survey.mjs <survey-id>");
  }

  let survey = await loadSurvey(surveyId);
  const job = await findCreateJob(surveyId);

  if (survey.create_flow_status === "created") {
    console.log(`Survey '${surveyId}' is already created`);
    return;
  }

  await updateJobStatus(job.id, "running");

  try {
    let contractAddress =
      survey.contract_address && survey.contract_address.trim().length > 0
        ? survey.contract_address.trim()
        : null;

    let deployTxHash =
      survey.deploy_tx_hash && survey.deploy_tx_hash.trim().length > 0
        ? survey.deploy_tx_hash.trim()
        : null;

    let registerTxHash =
      survey.register_tx_hash && survey.register_tx_hash.trim().length > 0
        ? survey.register_tx_hash.trim()
        : null;

    let registryId =
      survey.registry_id && String(survey.registry_id).trim().length > 0
        ? String(survey.registry_id).trim()
        : null;

    if (!contractAddress) {
      await updateCreateStatus(surveyId, {
        createFlowStatus: "deploying",
        createError: null,
      });

      const alias = `survey_${surveyId}`;
      const deployOutput = await runDeploySurvey(survey, alias);

      console.log("Deploy output:");
      console.log(deployOutput);

      contractAddress = extractContractAddress(deployOutput);
      deployTxHash = extractDeploymentTxHash(deployOutput);

      await updateCreateStatus(surveyId, {
        createFlowStatus: "registering",
        contractAddress,
        deployTxHash,
        createError: null,
      });

      survey = await loadSurvey(surveyId);
    } else {
      console.log(
        `Deploy step skipped: contract already exists at ${contractAddress}`,
      );
    }

    if (!registryId) {
      const alreadyRegistered = await runIsRegistered(
        survey.factory_address,
        contractAddress,
      );

      if (alreadyRegistered) {
        console.log(
          "Register step skipped: survey already registered in factory",
        );
        registryId = await runGetSurveyIdByAddress(
          survey.factory_address,
          contractAddress,
        );
      } else {
        await updateCreateStatus(surveyId, {
          createFlowStatus: "registering",
          contractAddress,
          deployTxHash,
          createError: null,
        });

        const createdAt = Math.floor(Date.now() / 1000);
        const registerOutput = await runRegisterSurvey(
          survey.factory_address,
          contractAddress,
          survey.sponsor,
          createdAt,
        );

        console.log("Register output:");
        console.log(registerOutput);

        registerTxHash = extractTransactionHash(registerOutput);
        registryId = await runGetSurveyIdByAddress(
          survey.factory_address,
          contractAddress,
        );
      }
    } else {
      console.log(
        `Register step skipped: registry_id already exists (${registryId})`,
      );
    }

    if (!registryId) {
      registryId = await ensureRegistryId({
        ...survey,
        contract_address: contractAddress,
        registry_id: registryId,
      });
    }

    if (!registryId) {
      throw new Error("Could not determine registry_id after create flow");
    }

    await updateCreateStatus(surveyId, {
      createFlowStatus: "created",
      contractAddress,
      registryId,
      deployTxHash,
      registerTxHash,
      createError: null,
    });

    await updateJobStatus(job.id, "done");
  } catch (err) {
    const message = truncateError(
      err instanceof Error ? err.message : String(err),
    );

    try {
      await updateCreateStatus(surveyId, {
        createFlowStatus: "failed",
        createError: message,
      });
    } catch (innerErr) {
      console.error("Failed to update create status to failed:", innerErr);
    }

    await updateJobStatus(job.id, "failed", message);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
