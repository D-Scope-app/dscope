import type { WalletConnection } from "../model";
import type { ParticipationPlan } from "../types";

type WalletSdkProviderLike = {
  id?: string;
  name?: string;
  icon?: string;
  metadata?: unknown;
  establishSecureChannel?: (appId: string) => Promise<{
    verificationHash: string;
    confirm: () => Promise<WalletSdkWalletLike>;
    cancel?: () => void;
  }>;
  onDisconnect?: (handler: () => void) => (() => void) | void;
  isDisconnected?: () => boolean;
  disconnect?: () => Promise<unknown>;
};

type WalletSdkWalletLike = {
  requestCapabilities?: (manifest: unknown) => Promise<unknown>;
  getAccounts?: () => Promise<unknown[]>;
  getChainInfo?: () => Promise<unknown>;
  registerContract?: (
    contractInstance: unknown,
    contractArtifact: unknown,
  ) => Promise<unknown>;
};

type WalletSdkConnection = {
  kind: "wallet-sdk";
  provider: WalletSdkProviderLike;
  wallet: WalletSdkWalletLike;
  account: string;
  accountAddress: string;
  capabilities?: unknown;
  disconnect?: (() => void) | void;
};

let activeWalletSdkConnection: WalletSdkConnection | null = null;

function debugParticipation(message: string, data?: unknown): void {
  console.info(`[D-Scope DEBUG] ${message}`, data ?? "");

  if (import.meta.env.VITE_WALLET_DEBUG_ALERTS !== "true") return;

  try {
    window.alert(`[D-Scope DEBUG] ${message}`);
  } catch {
    // Ignore alert failures in non-browser contexts. Console diagnostics remain available.
  }
}

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;

    for (const key of ["item", "account", "address", "value"] as const) {
      if (objectValue[key] !== undefined) {
        const normalized = normalizeString(objectValue[key]);
        if (normalized) return normalized;
      }
    }

    const toStringValue = objectValue.toString;
    if (typeof toStringValue === "function") {
      const normalized = String(toStringValue.call(value)).trim();
      if (normalized && normalized !== "[object Object]") return normalized;
    }
  }

  const stringified = String(value).trim();
  if (stringified && stringified !== "[object Object]") return stringified;

  return null;
}

function accountToAddress(account: string): string {
  const parts = account
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) || account;
}

function sameAztecAddress(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function parseBigIntEnv(name: string, fallback: string): bigint {
  const raw = (import.meta.env[name] || fallback).toString().trim();
  return BigInt(raw);
}

function getResultTxHash(value: unknown): string {
  const direct = normalizeString(value);
  if (direct && direct !== "[object Object]") return direct;

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;

    const txHash = normalizeString(objectValue.txHash);
    if (txHash) return txHash;

    const hash = normalizeString(objectValue.hash);
    if (hash) return hash;

    const receipt = objectValue.receipt;
    if (receipt && typeof receipt === "object") {
      const receiptTxHash = normalizeString(
        (receipt as Record<string, unknown>).txHash,
      );
      if (receiptTxHash) return receiptTxHash;
    }
  }

  throw new Error(
    "Azguard returned a transaction result, but tx hash could not be parsed.",
  );
}

async function getResultTxHashAsync(value: unknown): Promise<string | null> {
  const direct = normalizeString(value);
  if (direct && direct !== "[object Object]") return direct;

  if (!value || typeof value !== "object") return null;

  const objectValue = value as Record<string, unknown>;

  const getTxHash = objectValue.getTxHash;
  if (typeof getTxHash === "function") {
    const txHash = normalizeString(await getTxHash.call(value));
    if (txHash) return txHash;
  }

  const txHash = normalizeString(objectValue.txHash);
  if (txHash) return txHash;

  const hash = normalizeString(objectValue.hash);
  if (hash) return hash;

  const transactionHash = normalizeString(objectValue.transactionHash);
  if (transactionHash) return transactionHash;

  const receipt = objectValue.receipt;
  if (receipt && typeof receipt === "object") {
    return getResultTxHashAsync(receipt);
  }

  return null;
}

function parseParticipationField(name: string, value: unknown): bigint {
  const normalized = normalizeString(value);

  if (!normalized || !/^\d+$/.test(normalized)) {
    throw new Error(`Invalid participation ${name}: ${String(value)}`);
  }

  return BigInt(normalized);
}

type AztecAddressValue = {
  toString: () => string;
};

type AztecAddressRuntime = {
  isAddress?: (value: string) => boolean;
  fromString?: (value: string) => AztecAddressValue;
  fromStringUnsafe?: (value: string) => AztecAddressValue;
};

async function loadAztecAddressRuntime(): Promise<AztecAddressRuntime> {
  const addressesModule = await import("@aztec/aztec.js/addresses");
  const moduleRecord = addressesModule as Record<string, unknown>;

  const candidates = [
    moduleRecord.AztecAddress,
    (moduleRecord.default as Record<string, unknown> | undefined)?.AztecAddress,
    moduleRecord.default,
  ];

  const runtime = candidates.find((candidate) => {
    if (typeof candidate !== "function") return false;

    const addressRuntime = candidate as AztecAddressRuntime;
    return (
      typeof addressRuntime.fromStringUnsafe === "function" ||
      typeof addressRuntime.fromString === "function"
    );
  }) as AztecAddressRuntime | undefined;

  if (!runtime) {
    throw new Error(
      `No supported AztecAddress string parser was found in @aztec/aztec.js/addresses. Exports: ${Object.keys(moduleRecord).join(", ")}`,
    );
  }

  return runtime;
}

function aztecAddressFromString(
  runtime: AztecAddressRuntime,
  value: string,
): AztecAddressValue {
  const normalized = value.trim();

  if (
    typeof runtime.isAddress === "function" &&
    !runtime.isAddress(normalized)
  ) {
    throw new Error(`Invalid Aztec address: ${value}`);
  }

  if (typeof runtime.fromStringUnsafe === "function") {
    return runtime.fromStringUnsafe(normalized);
  }

  if (typeof runtime.fromString === "function") {
    return runtime.fromString(normalized);
  }

  throw new Error("AztecAddress string parser is unavailable.");
}

type AztecNodeClientLike = {
  getContract?: (address: unknown) => Promise<unknown>;
  getCurrentMinFees?: () => Promise<{
    feePerDaGas: bigint;
    feePerL2Gas: bigint;
  }>;
  getNodeInfo?: () => Promise<{
    txsLimits?: {
      gas?: unknown;
    };
  }>;
};

async function loadAztecNodeClientFactory(): Promise<
  ((nodeUrl: string) => AztecNodeClientLike) | null
> {
  const nodeModule = await import("@aztec/aztec.js/node").catch(() => null);

  const createAztecNodeClient =
    nodeModule && (nodeModule as Record<string, unknown>).createAztecNodeClient;

  if (typeof createAztecNodeClient !== "function") {
    console.warn(
      "[D-Scope] createAztecNodeClient is not available in this bundle.",
    );
    return null;
  }

  return createAztecNodeClient as (nodeUrl: string) => AztecNodeClientLike;
}

async function maybeRegisterParticipationGateInWallet(input: {
  wallet: WalletSdkWalletLike;
  target: string;
  artifact: unknown;
}): Promise<void> {
  if (!input.wallet.registerContract) {
    debugParticipation(
      "wallet.registerContract is not available; direct contract call only",
    );
    return;
  }

  debugParticipation(
    "wallet.registerContract is available; trying to register ParticipationGateV2",
  );

  try {
    const [AztecAddress, createAztecNodeClient] = await Promise.all([
      loadAztecAddressRuntime(),
      loadAztecNodeClientFactory(),
    ]);

    if (!createAztecNodeClient) return;

    const nodeUrl = (
      import.meta.env.VITE_AZTEC_NODE_URL ||
      import.meta.env.PUBLIC_AZTEC_NODE_URL ||
      "https://v5.testnet.rpc.aztec-labs.com"
    ).toString();

    const address = aztecAddressFromString(AztecAddress, input.target);
    const node = createAztecNodeClient(nodeUrl);
    const instance = await node.getContract?.(address);

    if (!instance) {
      console.warn(
        "[D-Scope] ParticipationGateV2 contract instance was not found on the Aztec node; continuing without explicit wallet.registerContract.",
        input.target,
      );
      return;
    }

    await input.wallet.registerContract(instance, input.artifact);
    debugParticipation(
      "ParticipationGateV2 registered in wallet",
      input.target,
    );
    console.info(
      "[D-Scope] ParticipationGateV2 registered in wallet",
      input.target,
    );
  } catch (error) {
    console.warn(
      "[D-Scope] Could not register ParticipationGateV2 in wallet before sending transaction. Trying direct contract call.",
      error,
    );
  }
}

async function sendWalletSdkParticipationTransaction(input: {
  contractCall: NonNullable<ParticipationPlan["contractCall"]>;
  participantAddress: string | null;
}): Promise<string> {
  debugParticipation("wallet-sdk participation function entered", input);

  const connection = activeWalletSdkConnection;

  if (!connection) {
    throw new Error(
      "Azguard wallet-sdk connection is not active. Reconnect Azguard and try again.",
    );
  }

  debugParticipation("wallet-sdk connection exists; importing Aztec modules");

  const [
    AztecAddress,
    feeModule,
    gasModule,
    createAztecNodeClient,
    participationGateModule,
  ] = await Promise.all([
    loadAztecAddressRuntime(),
    import("@aztec/aztec.js/fee").catch(() => null),
    import("@aztec/stdlib/gas").catch(() => null),
    loadAztecNodeClientFactory(),
    import("../contracts/participation_gate_v2/src/artifacts/ParticipationGateV2"),
  ]);

  debugParticipation("Aztec modules imported");
  debugParticipation("AztecAddress runtime resolved");

  const { ParticipationGateV2Contract, ParticipationGateV2ContractArtifact } =
    participationGateModule as {
      ParticipationGateV2Contract: {
        at: (
          address: unknown,
          wallet: unknown,
        ) => {
          methods: {
            participate: (
              surveyKey: bigint,
              policyHash: bigint,
              currentTime: bigint,
            ) => {
              simulate: (opts: unknown) => Promise<unknown>;
              send: (opts: unknown) => Promise<unknown>;
            };
          };
        };
      };
      ParticipationGateV2ContractArtifact: unknown;
    };

  debugParticipation("Parsing participation transaction fields");

  if (connection.provider.isDisconnected?.()) {
    activeWalletSdkConnection = null;
    throw new Error(
      "Azguard secure connection is no longer active. Reconnect the wallet and try again.",
    );
  }

  const connectedAddress = accountToAddress(
    connection.accountAddress || connection.account,
  );

  if (
    input.participantAddress &&
    !sameAztecAddress(connectedAddress, input.participantAddress)
  ) {
    throw new Error(
      "Connected Azguard account does not match the wallet used for verification. Reconnect the same account and try again.",
    );
  }

  const target = input.contractCall.target;
  if (!target) {
    throw new Error("Participation gate address is missing.");
  }

  const targetAddress = aztecAddressFromString(AztecAddress, target);
  const fromAddress = aztecAddressFromString(AztecAddress, connectedAddress);

  const surveyKey = parseParticipationField(
    "surveyKey",
    input.contractCall.args.surveyKey,
  );
  const policyHash = parseParticipationField(
    "policyHash",
    input.contractCall.args.policyHash,
  );
  const currentTime = parseParticipationField(
    "currentTime",
    input.contractCall.args.currentTime,
  );

  debugParticipation(
    "Attempting wallet contract registration before participate",
  );

  await maybeRegisterParticipationGateInWallet({
    wallet: connection.wallet,
    target,
    artifact: ParticipationGateV2ContractArtifact,
  });

  console.info("[D-Scope] sending ParticipationGateV2.participate", {
    target,
    from: fromAddress.toString(),
    surveyKey: surveyKey.toString(),
    policyHash: policyHash.toString(),
    currentTime: currentTime.toString(),
  });

  debugParticipation("Creating ParticipationGateV2 contract binding");

  const participationGate = ParticipationGateV2Contract.at(
    targetAddress,
    connection.wallet,
  );
  const interaction = participationGate.methods.participate(
    surveyKey,
    policyHash,
    currentTime,
  );

  const transactionOptions: Record<string, unknown> = {
    from: fromAddress,
  };

  const nodeUrl = (
    import.meta.env.VITE_AZTEC_NODE_URL ||
    import.meta.env.PUBLIC_AZTEC_NODE_URL ||
    "https://v5.testnet.rpc.aztec-labs.com"
  ).toString();

  let gasSettings: unknown = null;

  if (createAztecNodeClient && gasModule) {
    const Gas = (gasModule as Record<string, unknown>).Gas;
    const GasSettings = (gasModule as Record<string, unknown>).GasSettings;

    if (
      typeof Gas === "function" &&
      typeof (Gas as { from?: unknown }).from === "function" &&
      typeof GasSettings === "function" &&
      typeof (GasSettings as { from?: unknown }).from === "function"
    ) {
      const node = createAztecNodeClient(nodeUrl);
      const [networkFees, nodeInfo] = await Promise.all([
        node.getCurrentMinFees?.(),
        node.getNodeInfo?.(),
      ]);
      const networkGasLimit = nodeInfo?.txsLimits?.gas;

      if (networkFees && networkGasLimit) {
        const gasLimits = (
          Gas as unknown as {
            from: (value: unknown) => { daGas: number; l2Gas: number };
          }
        ).from(networkGasLimit);
        gasSettings = (
          GasSettings as unknown as { from: (value: unknown) => unknown }
        ).from({
          gasLimits,
          teardownGasLimits: {
            daGas: Math.max(1, Math.floor(gasLimits.daGas / 2)),
            l2Gas: Math.max(1, Math.floor(gasLimits.l2Gas / 8)),
          },
          maxFeesPerGas: {
            feePerDaGas: networkFees.feePerDaGas * 2n,
            feePerL2Gas: networkFees.feePerL2Gas * 2n,
          },
          maxPriorityFeesPerGas: {
            feePerDaGas: 0n,
            feePerL2Gas: 0n,
          },
        });

        debugParticipation("Dynamic Aztec gas settings prepared", {
          nodeUrl,
          currentMinFees: {
            feePerDaGas: networkFees.feePerDaGas.toString(),
            feePerL2Gas: networkFees.feePerL2Gas.toString(),
          },
          maxFeesPerGas: {
            feePerDaGas: (networkFees.feePerDaGas * 2n).toString(),
            feePerL2Gas: (networkFees.feePerL2Gas * 2n).toString(),
          },
          gasLimits,
        });
      }
    }
  }

  if (!gasSettings) {
    console.warn(
      "[D-Scope] Dynamic gas settings could not be created. The wallet default fee ceiling will be used.",
    );
  }

  const fpcAddress = (
    import.meta.env.VITE_AZTEC_SPONSORED_FPC_ADDRESS ||
    import.meta.env.VITE_AZTEC_FPC_ADDRESS ||
    "0x1969946536f0c09269e2c75e414eef4e21a76e763c5514125208db33d7d944d7"
  ).toString();
  const SponsoredFeePaymentMethod =
    feeModule &&
    (feeModule as Record<string, unknown>).SponsoredFeePaymentMethod;

  if (typeof SponsoredFeePaymentMethod === "function") {
    transactionOptions.fee = {
      paymentMethod: new (SponsoredFeePaymentMethod as new (
        address: unknown,
      ) => unknown)(aztecAddressFromString(AztecAddress, fpcAddress)),
      ...(gasSettings ? { gasSettings } : {}),
    };
  } else if (gasSettings) {
    transactionOptions.fee = { gasSettings };
    console.warn(
      "[D-Scope] SponsoredFeePaymentMethod is unavailable. Dynamic gas settings will be used with the wallet default payment method.",
    );
  } else {
    console.warn(
      "[D-Scope] SponsoredFeePaymentMethod is unavailable. Wallet preflight will continue without an explicit sponsored fee method.",
    );
  }

  debugParticipation(
    "Running ParticipationGateV2.participate() preflight simulation through the active Wallet SDK connection",
  );

  try {
    const simulation = await interaction.simulate({
      ...transactionOptions,
      includeMetadata: true,
    });
    console.info("[D-Scope] participation preflight simulation succeeded", {
      target,
      from: fromAddress.toString(),
      simulation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[D-Scope] participation preflight simulation failed", error);
    throw new Error(
      `Participation preflight failed before wallet approval: ${message}`,
      { cause: error },
    );
  }

  debugParticipation(
    "Preflight succeeded; sending through the same Wallet SDK connection",
  );

  const sentTx = await interaction.send(transactionOptions);

  debugParticipation("participate().send() returned", sentTx);

  const earlyTxHash = await getResultTxHashAsync(sentTx);
  const wait = (sentTx as { wait?: () => Promise<unknown> }).wait;

  if (typeof wait !== "function") {
    const txHash = earlyTxHash || getResultTxHash(sentTx);
    console.info("[D-Scope] participation tx submitted", txHash);
    return txHash;
  }

  const receipt = await wait.call(sentTx);
  const receiptTxHash = await getResultTxHashAsync(receipt);
  const txHash = receiptTxHash || earlyTxHash;

  if (!txHash) {
    throw new Error(
      "Azguard submitted the participation transaction, but tx hash could not be parsed.",
    );
  }

  console.info("[D-Scope] participation tx confirmed", txHash);
  return txHash;
}

function extractGrantedAccount(capabilities: unknown): string | null {
  if (!capabilities || typeof capabilities !== "object") return null;

  const granted = (capabilities as Record<string, unknown>).granted;
  if (!Array.isArray(granted)) return null;

  for (const capability of granted) {
    if (!capability || typeof capability !== "object") continue;

    const cap = capability as Record<string, unknown>;
    if (cap.type !== "accounts") continue;

    const accounts = cap.accounts;
    if (!Array.isArray(accounts)) continue;

    for (const account of accounts) {
      const normalized = normalizeString(account);
      if (normalized) return normalized;
    }
  }

  return null;
}

async function getWalletSdkChainInfo() {
  const [{ Fr }, createAztecNodeClient] = await Promise.all([
    import("@aztec/aztec.js/fields"),
    loadAztecNodeClientFactory(),
  ]);

  let l1ChainId = parseBigIntEnv(
    "VITE_AZTEC_L1_CHAIN_ID",
    "11155111",
  );
  let rollupVersion = parseBigIntEnv(
    "VITE_AZTEC_ROLLUP_VERSION",
    "1821665230",
  );

  const nodeUrl = (
    import.meta.env.VITE_AZTEC_NODE_URL ||
    import.meta.env.PUBLIC_AZTEC_NODE_URL ||
    "https://v5.testnet.rpc.aztec-labs.com"
  ).toString();

  const readBigInt = (value: unknown, fallback: bigint): bigint => {
    try {
      const normalized = normalizeString(value);
      return normalized ? BigInt(normalized) : fallback;
    } catch {
      return fallback;
    }
  };

  if (createAztecNodeClient) {
    try {
      const nodeInfoRequest =
        createAztecNodeClient(nodeUrl).getNodeInfo?.();

      if (nodeInfoRequest) {
        const nodeInfo = (await Promise.race([
          nodeInfoRequest,
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error("Aztec node info timeout")),
              10_000,
            );
          }),
        ])) as unknown as {
          l1ChainId?: unknown;
          rollupVersion?: unknown;
          nodeVersion?: unknown;
        };

        l1ChainId = readBigInt(nodeInfo.l1ChainId, l1ChainId);
        rollupVersion = readBigInt(
          nodeInfo.rollupVersion,
          rollupVersion,
        );

        console.info("[D-Scope] live Aztec chain info", {
          nodeVersion: normalizeString(nodeInfo.nodeVersion),
          l1ChainId: l1ChainId.toString(),
          rollupVersion: rollupVersion.toString(),
        });
      }
    } catch (error) {
      console.warn(
        "[D-Scope] Could not load live Aztec chain info; using configured fallback.",
        error,
      );
    }
  }

  const FrRuntime = Fr as unknown as {
    new (value: bigint | number | string): unknown;
    fromString?: (value: string) => unknown;
    fromBigInt?: (value: bigint) => unknown;
  };

  const toFr = (value: bigint) => {
    if (typeof FrRuntime.fromBigInt === "function") {
      return FrRuntime.fromBigInt(value);
    }

    if (typeof FrRuntime.fromString === "function") {
      return FrRuntime.fromString(value.toString());
    }

    return new FrRuntime(value);
  };

  return {
    chainId: toFr(l1ChainId),
    version: toFr(rollupVersion),
  };
}

function formatVerificationEmojis(value: unknown): string {
  if (Array.isArray(value)) return value.flat().join(" ");
  return String(value);
}

function showWalletSdkEmojiVerificationDialog(
  emojis: string,
): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Verify Azguard connection");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.padding = "24px";
    overlay.style.background = "rgba(2, 6, 23, 0.72)";
    overlay.style.backdropFilter = "blur(10px)";

    const card = document.createElement("div");
    card.style.width = "min(520px, 100%)";
    card.style.border = "1px solid rgba(148, 163, 184, 0.28)";
    card.style.borderRadius = "24px";
    card.style.background =
      "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.96))";
    card.style.boxShadow =
      "0 32px 90px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(96, 165, 250, 0.1) inset";
    card.style.padding = "24px";
    card.style.color = "#f8fafc";
    card.style.fontFamily =
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const eyebrow = document.createElement("div");
    eyebrow.textContent = "Azguard secure connection";
    eyebrow.style.color = "#67e8f9";
    eyebrow.style.fontSize = "12px";
    eyebrow.style.fontWeight = "800";
    eyebrow.style.letterSpacing = "0.12em";
    eyebrow.style.textTransform = "uppercase";
    eyebrow.style.marginBottom = "10px";

    const title = document.createElement("h2");
    title.textContent = "Compare the emojis";
    title.style.margin = "0 0 10px";
    title.style.fontSize = "28px";
    title.style.lineHeight = "1.08";
    title.style.fontWeight = "900";

    const body = document.createElement("p");
    body.textContent =
      "Move the Azguard window aside if needed. These emojis must match the ones shown in Azguard before the wallet connection can be trusted.";
    body.style.margin = "0 0 18px";
    body.style.color = "#cbd5e1";
    body.style.fontSize = "15px";
    body.style.lineHeight = "1.55";

    const emojiBox = document.createElement("div");
    emojiBox.textContent = emojis;
    emojiBox.style.display = "grid";
    emojiBox.style.placeItems = "center";
    emojiBox.style.minHeight = "96px";
    emojiBox.style.border = "1px solid rgba(96, 165, 250, 0.28)";
    emojiBox.style.borderRadius = "18px";
    emojiBox.style.background = "rgba(15, 23, 42, 0.72)";
    emojiBox.style.fontSize = "32px";
    emojiBox.style.lineHeight = "1.8";
    emojiBox.style.wordBreak = "break-word";
    emojiBox.style.textAlign = "center";
    emojiBox.style.padding = "16px";
    emojiBox.style.marginBottom = "18px";

    const hint = document.createElement("p");
    hint.textContent =
      "If they are different, reject the connection. If they match, approve in both D-Scope and Azguard.";
    hint.style.margin = "0 0 18px";
    hint.style.color = "#94a3b8";
    hint.style.fontSize = "13px";
    hint.style.lineHeight = "1.45";

    const actions = document.createElement("div");
    actions.style.display = "grid";
    actions.style.gridTemplateColumns = "1fr 1fr";
    actions.style.gap = "12px";

    const reject = document.createElement("button");
    reject.type = "button";
    reject.textContent = "They do not match";
    reject.style.border = "1px solid rgba(148, 163, 184, 0.22)";
    reject.style.borderRadius = "14px";
    reject.style.background = "rgba(30, 41, 59, 0.92)";
    reject.style.color = "#fecaca";
    reject.style.fontWeight = "800";
    reject.style.padding = "13px 16px";
    reject.style.cursor = "pointer";

    const approve = document.createElement("button");
    approve.type = "button";
    approve.textContent = "They match";
    approve.style.border = "1px solid rgba(103, 232, 249, 0.38)";
    approve.style.borderRadius = "14px";
    approve.style.background = "linear-gradient(135deg, #2563eb, #06b6d4)";
    approve.style.color = "#ffffff";
    approve.style.fontWeight = "900";
    approve.style.padding = "13px 16px";
    approve.style.cursor = "pointer";

    const cleanup = (value: boolean) => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cleanup(false);
    };

    reject.addEventListener("click", () => cleanup(false));
    approve.addEventListener("click", () => cleanup(true));
    document.addEventListener("keydown", onKeyDown);

    actions.append(reject, approve);
    card.append(eyebrow, title, body, emojiBox, hint, actions);
    overlay.append(card);
    document.body.append(overlay);
    approve.focus();
  });
}

async function waitForWalletProvider(input: {
  manager: {
    getAvailableWallets: (args: unknown) => unknown;
  };
  chainInfo: unknown;
}): Promise<WalletSdkProviderLike> {
  let discovery: { cancel?: () => void; done?: Promise<unknown> } | null = null;

  const provider = await new Promise<WalletSdkProviderLike>(
    (resolve, reject) => {
      const timeout = window.setTimeout(() => {
        discovery?.cancel?.();
        reject(
          new Error(
            "No Aztec wallet approved the connection request. Please open Azguard and try again.",
          ),
        );
      }, 60_000);

      const onWalletDiscovered = (nextProvider: WalletSdkProviderLike) => {
        window.clearTimeout(timeout);
        discovery?.cancel?.();
        resolve(nextProvider);
      };

      discovery = input.manager.getAvailableWallets({
        appId: "dscope-app",
        chainInfo: input.chainInfo,
        onWalletDiscovered,
      }) as { cancel?: () => void; done?: Promise<unknown> };

      discovery.done?.catch((error) => {
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    },
  );

  if (!provider.establishSecureChannel) {
    throw new Error(
      "Selected Aztec wallet does not expose a secure channel API.",
    );
  }

  return provider;
}

async function connectWithWalletSdk(): Promise<WalletSdkConnection> {
  const [{ WalletManager }, { hashToEmoji }] = await Promise.all([
    import("@aztec/wallet-sdk/manager"),
    import("@aztec/wallet-sdk/crypto"),
  ]);

  const chainInfo = await getWalletSdkChainInfo();
  const manager = WalletManager.configure({
    extensions: { enabled: true },
  }) as {
    getAvailableWallets: (args: unknown) => unknown;
  };

  const provider = await waitForWalletProvider({ manager, chainInfo });
  const pending = await provider.establishSecureChannel!("dscope-app");
  const emojis = formatVerificationEmojis(
    hashToEmoji(pending.verificationHash),
  );

  const confirmed = await showWalletSdkEmojiVerificationDialog(emojis);

  if (!confirmed) {
    pending.cancel?.();
    throw new Error(
      "Azguard connection was cancelled before emoji verification.",
    );
  }

  const wallet = await pending.confirm();

  const capabilities = await wallet.requestCapabilities?.({
    version: "1.0",
    metadata: {
      name: "D-Scope",
      version: "0.1.0",
      description: "Private research campaigns for verified audiences.",
      url: window.location.origin,
    },
    capabilities: [
      { type: "accounts", canGet: true, canCreateAuthWit: true },
      {
        type: "simulation",
        transactions: { scope: "*" },
        utilities: { scope: "*" },
      },
      {
        type: "contracts",
        contracts: "*",
        canRegister: true,
        canGetMetadata: true,
      },
      { type: "transaction", scope: "*" },
    ],
  });

  let account = extractGrantedAccount(capabilities);

  if (!account && wallet.getAccounts) {
    const accounts = await wallet.getAccounts();
    account = normalizeString(accounts[0]);
  }

  if (!account) {
    throw new Error(
      "Azguard connected, but no account was granted. Please select an account in Azguard and try again.",
    );
  }

  const accountAddress = accountToAddress(account);
  console.info("[D-Scope] wallet-sdk capabilities granted", capabilities);

  const disconnect = provider.onDisconnect?.(() => {
    activeWalletSdkConnection = null;
  });

  return {
    kind: "wallet-sdk",
    provider,
    wallet,
    account,
    accountAddress,
    capabilities,
    disconnect,
  };
}

export function getActiveAzguardWallet(): WalletSdkWalletLike | null {
  return activeWalletSdkConnection?.wallet ?? null;
}

export async function disconnectAzguardWallet(): Promise<void> {
  activeWalletSdkConnection?.disconnect?.();
  await activeWalletSdkConnection?.provider.disconnect?.();
  activeWalletSdkConnection = null;
}

export async function connectAzguardWallet(): Promise<WalletConnection> {
  await disconnectAzguardWallet();

  const connection = await connectWithWalletSdk();
  activeWalletSdkConnection = connection;

  return {
    connected: true,
    source: "azguard",
    accountAddress: connection.accountAddress,
    participantRef: connection.accountAddress,
    label: "Azguard account",
  };
}

export async function sendAzguardParticipationTransaction(input: {
  participationPlan: ParticipationPlan | null | undefined;
  participantAddress: string | null;
}): Promise<string> {
  debugParticipation("sendAzguardParticipationTransaction entered", input);

  const { participationPlan, participantAddress } = input;
  const contractCall = participationPlan?.contractCall;

  if (!contractCall) {
    throw new Error(
      "Participation plan does not include an Azguard contract call.",
    );
  }

  if (!contractCall.target) {
    throw new Error(
      "Participation gate address is missing from participation plan.",
    );
  }

  if (contractCall.method !== "participate") {
    throw new Error(
      `Unsupported participation method: ${contractCall.method}. Expected participate.`,
    );
  }

  if (!contractCall.args.policyHash) {
    throw new Error("Policy hash is missing from participation plan.");
  }

  if (!activeWalletSdkConnection) {
    throw new Error("Connect Azguard before recording participation.");
  }

  debugParticipation(
    "using the active Wallet SDK proxy for registration, simulation and send",
  );

  try {
    return await sendWalletSdkParticipationTransaction({
      contractCall,
      participantAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[D-Scope DEBUG] wallet-sdk participation failed", error);
    debugParticipation(`wallet-sdk participation failed: ${message}`);
    throw error;
  }
}
