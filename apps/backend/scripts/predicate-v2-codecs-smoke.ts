import {
  buildCredentialContractArgsV2,
  buildPredicatePolicyContractArgsV2,
} from "../src/domain/predicate/predicate-v2-codecs";

const policy = buildPredicatePolicyContractArgsV2({
  ageBuckets: ["31_35"],
  countries: ["RU"],
  regions: ["EECA"],
});

console.log("\n--- policy v2 ---");
console.log(JSON.stringify(policy, null, 2));

const credential = buildCredentialContractArgsV2({
  ageBucket: "31_35",
  country: "RUS",
  validUntil: 999999,
  sourceTag: 1,
  credentialVersion: 2,
});

console.log("\n--- credential v2 ---");
console.log(JSON.stringify(credential, null, 2));
