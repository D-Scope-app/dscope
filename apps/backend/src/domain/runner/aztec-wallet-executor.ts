import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AztecWalletExecutorConfig = {
  nodeUrl?: string;
  from?: string;
  maxBufferBytes?: number;
};

export type AztecWalletCommandResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
};

export type AztecWalletSendInput = {
  functionName: string;
  contractAddress: string;
  contractArtifact: string;
  args?: string[];
  from?: string;
  nodeUrl?: string;
};

export type AztecWalletSimulateInput = {
  functionName: string;
  contractAddress: string;
  contractArtifact: string;
  args?: string[];
  from?: string;
  nodeUrl?: string;
};

export type AztecWalletDeployInput = {
  contractArtifact: string;
  args?: string[];
  alias?: string;
  from?: string;
  nodeUrl?: string;
};

function getDefaultNodeUrl(inputNodeUrl?: string): string {
  return inputNodeUrl || process.env.AZTEC_NODE_URL || "http://localhost:8080";
}

function getDefaultFrom(inputFrom?: string): string {
  return inputFrom || process.env.AZTEC_FROM_ALIAS || "accounts:test0";
}

function buildCommandPreview(args: string[]): string {
  return `aztec-wallet ${args.join(" ")}`;
}

export async function runAztecWalletCommand(
  args: string[],
  config: AztecWalletExecutorConfig = {},
): Promise<AztecWalletCommandResult> {
  const commandPreview = buildCommandPreview(args);

  console.log("\nRunning:");
  console.log(commandPreview);

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: config.maxBufferBytes ?? 1024 * 1024 * 30,
  });

  if (stdout) {
    console.log(stdout);
  }

  if (stderr) {
    console.error(stderr);
  }

  return {
    command: "aztec-wallet",
    args,
    stdout,
    stderr,
  };
}

export async function aztecWalletSend(
  input: AztecWalletSendInput,
): Promise<AztecWalletCommandResult> {
  const args = [
    "send",
    input.functionName,
    "--node-url",
    getDefaultNodeUrl(input.nodeUrl),
    "--from",
    getDefaultFrom(input.from),
    "--contract-address",
    input.contractAddress,
    "--contract-artifact",
    input.contractArtifact,
    "--args",
    ...(input.args ?? []),
  ];

  return runAztecWalletCommand(args);
}

export async function aztecWalletSimulate(
  input: AztecWalletSimulateInput,
): Promise<AztecWalletCommandResult> {
  const args = [
    "simulate",
    input.functionName,
    "--node-url",
    getDefaultNodeUrl(input.nodeUrl),
    "--from",
    getDefaultFrom(input.from),
    "--contract-address",
    input.contractAddress,
    "--contract-artifact",
    input.contractArtifact,
  ];

  if (input.args && input.args.length > 0) {
    args.push("--args", ...input.args);
  }

  return runAztecWalletCommand(args);
}

export async function aztecWalletDeploy(
  input: AztecWalletDeployInput,
): Promise<AztecWalletCommandResult> {
  const args = [
    "deploy",
    input.contractArtifact,
    "--node-url",
    getDefaultNodeUrl(input.nodeUrl),
    "--from",
    getDefaultFrom(input.from),
  ];

  if (input.args && input.args.length > 0) {
    args.push("--args", ...input.args);
  }

  if (input.alias) {
    args.push("-a", input.alias);
  }

  return runAztecWalletCommand(args);
}

export function extractSimulationResult(stdout: string): string | null {
  const match = stdout.match(/Simulation result:\s+(.+)/);

  if (!match) {
    return null;
  }

  return match[1]?.trim() ?? null;
}

export function extractTransactionHash(stdout: string): string | null {
  const match = stdout.match(/Transaction hash:\s+(0x[a-fA-F0-9]+)/);

  if (!match) {
    return null;
  }

  return match[1] ?? null;
}

export function extractDeployedContractAddress(stdout: string): string | null {
  const match =
    stdout.match(/Contract deployed at\s+(0x[a-fA-F0-9]+)/) ??
    stdout.match(/Deployed contract address:\s+(0x[a-fA-F0-9]+)/);

  if (!match) {
    return null;
  }

  return match[1] ?? null;
}
