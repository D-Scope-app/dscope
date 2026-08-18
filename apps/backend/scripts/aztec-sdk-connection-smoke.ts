import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { createAztecSdkConnection } from "../src/domain/runner/aztec-sdk-connection";

async function main() {
  const connection = await createAztecSdkConnection({ accountsToLoad: 3 });
  const nodeInfo = await connection.node.getNodeInfo();

  const accounts = await Promise.all(
    connection.accounts.map(async (account) => {
      const feeJuiceBalance = await getFeeJuiceBalance(account.address, connection.node);
      return {
        alias: account.alias,
        address: account.addressString,
        feeJuiceBalance: feeJuiceBalance.toString(),
      };
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        nodeUrl: connection.nodeUrl,
        nodeVersion: nodeInfo.nodeVersion,
        chainId: nodeInfo.l1ChainId?.toString?.() ?? String(nodeInfo.l1ChainId),
        accounts,
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
