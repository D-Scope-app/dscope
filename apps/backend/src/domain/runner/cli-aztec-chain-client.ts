import type {
  MvpChainClient,
  MvpChainCommandResult,
  MvpChainDeployInput,
  MvpChainSendInput,
  MvpChainSimulateInput,
} from "./mvp-chain-client";
import {
  aztecWalletDeploy,
  aztecWalletSend,
  aztecWalletSimulate,
  extractDeployedContractAddress,
  extractSimulationResult,
  extractTransactionHash,
} from "./aztec-wallet-executor";

function cleanAztecNumber(value: string | null): string | null {
  if (!value) return null;
  return value.trim().replace(/n$/, "");
}

export class CliAztecChainClient implements MvpChainClient {
  async deploy(input: MvpChainDeployInput): Promise<MvpChainCommandResult> {
    const result = await aztecWalletDeploy({
      contractArtifact: input.contractArtifact,
      args: input.args,
      alias: input.alias,
      from: input.from,
    });

    return {
      rawStdout: result.stdout,
      rawStderr: result.stderr,
      deployedAddress: extractDeployedContractAddress(result.stdout),
      txHash: extractTransactionHash(result.stdout),
    };
  }

  async send(input: MvpChainSendInput): Promise<MvpChainCommandResult> {
    const result = await aztecWalletSend({
      functionName: input.functionName,
      contractAddress: input.contractAddress,
      contractArtifact: input.contractArtifact,
      args: input.args,
      from: input.from,
    });

    return {
      rawStdout: result.stdout,
      rawStderr: result.stderr,
      txHash: extractTransactionHash(result.stdout),
    };
  }

  async simulate(input: MvpChainSimulateInput): Promise<MvpChainCommandResult> {
    const result = await aztecWalletSimulate({
      functionName: input.functionName,
      contractAddress: input.contractAddress,
      contractArtifact: input.contractArtifact,
      args: input.args,
      from: input.from,
    });

    return {
      rawStdout: result.stdout,
      rawStderr: result.stderr,
      simulationResult: cleanAztecNumber(extractSimulationResult(result.stdout)),
    };
  }
}
