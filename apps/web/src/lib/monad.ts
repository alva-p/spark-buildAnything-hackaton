import { defineChain } from "viem";

export const monadMainnet = defineChain({
  id: 143,
  name: "Monad Mainnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://monadscan.com",
    },
  },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://testnet.monadscan.com",
    },
  },
  testnet: true,
});

export const monadChains = {
  mainnet: monadMainnet,
  testnet: monadTestnet,
} as const;

export type MonadNetwork = keyof typeof monadChains;

export function resolveVaultNetwork(
  requested: MonadNetwork | null,
  mainnetFound: boolean,
  testnetFound: boolean,
): MonadNetwork | undefined {
  return requested ?? (mainnetFound ? "mainnet" : testnetFound ? "testnet" : undefined);
}

export function vaultHistoryEntries<T>(mainnet: readonly T[], testnet: readonly T[]) {
  return [
    ...[...mainnet].reverse().map((address, index) => ({
      address,
      network: "mainnet" as const,
      number: mainnet.length - index,
    })),
    ...[...testnet].reverse().map((address, index) => ({
      address,
      network: "testnet" as const,
      number: testnet.length - index,
    })),
  ];
}
