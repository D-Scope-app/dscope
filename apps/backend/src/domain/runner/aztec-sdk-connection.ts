import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

export type AztecSdkLocalAccount = {
  alias: string;
  address: AztecAddress;
  addressString: string;
};

export type AztecSdkConnection = {
  nodeUrl: string;
  node: ReturnType<typeof createAztecNodeClient>;
  wallet: Awaited<ReturnType<typeof EmbeddedWallet.create>>;
  accounts: AztecSdkLocalAccount[];
};

export type CreateAztecSdkConnectionOptions = {
  nodeUrl?: string;
  accountsToLoad?: number;
};

export function resolveAztecNodeUrl(nodeUrl?: string): string {
  return nodeUrl ?? process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
}

/**
 * Creates an EmbeddedWallet and registers local-network pre-funded test accounts.
 *
 * This is intended for local/dev runner smoke tests only. A public MVP runner may still
 * use an SDK Wallet interface, but the concrete wallet implementation can later be
 * swapped for a production wallet/provider flow.
 */
export async function createAztecSdkConnection(
  options: CreateAztecSdkConnectionOptions = {},
): Promise<AztecSdkConnection> {
  const nodeUrl = resolveAztecNodeUrl(options.nodeUrl);
  const accountsToLoad = Math.max(1, options.accountsToLoad ?? 3);

  const node = createAztecNodeClient(nodeUrl);
  await waitForNode(node);

  const wallet = await EmbeddedWallet.create(node, { ephemeral: true });
  const testAccounts = await getInitialTestAccountsData();

  const accounts: AztecSdkLocalAccount[] = [];

  for (const [index, account] of testAccounts.slice(0, accountsToLoad).entries()) {
    const created = await wallet.createSchnorrInitializerlessAccount(
      account.secret,
      account.salt,
      account.signingKey,
    );

    accounts.push({
      alias: `accounts:test${index}`,
      address: created.address,
      addressString: created.address.toString(),
    });
  }

  return {
    nodeUrl,
    node,
    wallet,
    accounts,
  };
}

export function findSdkAccount(
  connection: AztecSdkConnection,
  aliasOrAddress: string | undefined,
): AztecSdkLocalAccount {
  const requested = aliasOrAddress ?? "accounts:test0";

  const byAlias = connection.accounts.find((account) => account.alias === requested);
  if (byAlias) return byAlias;

  const byAddress = connection.accounts.find(
    (account) => account.addressString.toLowerCase() === requested.toLowerCase(),
  );
  if (byAddress) return byAddress;

  throw new Error(
    `SDK account not loaded: ${requested}. ` +
      `Loaded accounts: ${connection.accounts.map((a) => `${a.alias}=${a.addressString}`).join(", ")}`,
  );
}
