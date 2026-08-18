export type MvpChainDeployInput = {
  contractArtifact: string;
  args?: string[];
  alias?: string;
  from?: string;
};

export type MvpChainSendInput = {
  functionName: string;
  contractAddress: string;
  contractArtifact: string;
  args?: string[];
  from?: string;
};

export type MvpChainSimulateInput = {
  functionName: string;
  contractAddress: string;
  contractArtifact: string;
  args?: string[];
  from?: string;
};

export type MvpChainCommandResult = {
  rawStdout?: string;
  rawStderr?: string;
  txHash?: string | null;
  deployedAddress?: string | null;
  simulationResult?: string | null;
};

export interface MvpChainClient {
  deploy(input: MvpChainDeployInput): Promise<MvpChainCommandResult>;
  send(input: MvpChainSendInput): Promise<MvpChainCommandResult>;
  simulate(input: MvpChainSimulateInput): Promise<MvpChainCommandResult>;
}
