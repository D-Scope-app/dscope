import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildExpectedZkPassportQuery,
  buildZkPassportBinding,
  buildZkPassportScope,
  canonicalJson,
  createVerificationClientToken,
  hashVerificationClientToken,
} from "../src/domain/verification/trusted-zkpassport.ts";

async function main() {
  const scopeA = buildZkPassportScope({
    surveyId: "survey-1",
    surveyKey: "survey-key-1",
  });
  const scopeRetry = buildZkPassportScope({
    surveyId: "survey-1",
    surveyKey: "changed-display-key",
  });
  const scopeOtherSurvey = buildZkPassportScope({
    surveyId: "survey-2",
    surveyKey: "survey-key-2",
  });

  assert.equal(scopeA, scopeRetry, "scope must be stable across sessions");
  assert.notEqual(scopeA, scopeOtherSurvey, "scope must separate surveys");
  assert(!scopeA.includes("session"), "scope must not contain a session id");

  const bindingA = buildZkPassportBinding({
    sessionId: "session-a",
    walletAddress: "0xabc",
  });
  const bindingB = buildZkPassportBinding({
    sessionId: "session-b",
    walletAddress: "0xabc",
  });
  assert.notEqual(bindingA, bindingB, "binding must separate retries");
  assert(bindingA.includes("0xabc"), "binding must include the credential recipient");

  assert.equal(
    canonicalJson(buildExpectedZkPassportQuery(bindingA)),
    canonicalJson({
      bind: { custom_data: bindingA },
      birthdate: { disclose: true },
      nationality: { disclose: true },
      age: { gte: 18 },
    }),
  );

  const tokenA = createVerificationClientToken();
  const tokenB = createVerificationClientToken();
  assert(tokenA.length >= 40);
  assert.notEqual(tokenA, tokenB);
  assert.notEqual(
    await hashVerificationClientToken(tokenA),
    await hashVerificationClientToken(tokenB),
  );

  const surveyPage = await readFile(
    new URL("../frontend/src/app/pages/SurveyPage.tsx", import.meta.url),
    "utf8",
  );
  const workerRoute = await readFile(
    new URL("../src/routes/verification.ts", import.meta.url),
    "utf8",
  );
  const verifierService = await readFile(
    new URL("./zkpassport-verifier-service.mjs", import.meta.url),
    "utf8",
  );

  assert(!surveyPage.includes("Use dev verification"));
  assert(!surveyPage.includes("completeVerificationSession"));
  assert(!surveyPage.includes("verified: Boolean(payload.verified)"));
  assert(surveyPage.includes('.bind("custom_data", session.request.binding)'));
  assert(
    surveyPage.includes(
      "uniqueIdentifierType={NullifierType.NON_SALTED}",
    ),
  );
  assert(surveyPage.includes("originalQueryRef.current = built.query"));

  assert(workerRoute.includes("trusted_zkpassport_nullifiers"));
  assert(workerRoute.includes("server_verified_zkpassport"));
  assert(workerRoute.includes("Field '${suppliedTrustField}' is not accepted"));
  assert(workerRoute.includes("env.dscope_db.batch(["));
  assert(workerRoute.includes('session.status === "verified"'));
  assert(workerRoute.includes("idempotent: true"));
  assert(workerRoute.includes("sessionExpired(session)"));
  assert(!workerRoute.includes("normalizePredicateOutcomeFromRaw({"));

  assert(verifierService.includes("await zkPassport.verify({"));
  assert(verifierService.includes("devMode: false"));
  assert(verifierService.includes("disableProofStorage: true"));
  assert(
    verifierService.includes(
      "result.uniqueIdentifierType !== NullifierType.NON_SALTED",
    ),
  );
  assert(verifierService.includes("claim.domain !== DOMAIN"));
  assert(!verifierService.includes("console.log(payload"));

  console.log("TRUSTED_ZKPASSPORT_SMOKE_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
