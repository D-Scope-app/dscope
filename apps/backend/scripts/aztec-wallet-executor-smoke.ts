import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import {
  aztecWalletSimulate,
  extractSimulationResult,
} from "../src/domain/runner/aztec-wallet-executor";

async function main() {
  const rewardVaultAddress = process.env.REWARD_VAULT_MVP;

  if (!rewardVaultAddress) {
    throw new Error("Missing REWARD_VAULT_MVP env var");
  }

  const result = await aztecWalletSimulate({
    functionName: "get_reward_status",
    contractAddress: rewardVaultAddress,
    contractArtifact:
      dscopeFileURLToPath(new URL("../../../contracts/reward_vault_mvp/target/reward_vault_mvp-RewardVaultMVP.json", import.meta.url)),
    args: ["401"],
  });

  const parsed = extractSimulationResult(result.stdout);

  console.log(
    JSON.stringify(
      {
        rawSimulationResult: parsed,
        expectedMeaning: {
          "0": "NONE",
          "1": "REGISTERED",
          "2": "FINALIZED",
          "3": "CLAIMS_CLOSED",
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
