import { getAddress, type Address } from "viem";
import type { MonadNetwork } from "@/lib/monad";
export { factoryAbi, vaultAbi } from "@/generated/abis";

export const factoryAddresses = {
  mainnet: getAddress("0x0ccbe83afD8423baE0094857B3D97cAec9B52D0C"),
  testnet: getAddress("0xe3335E3Ea2DbFe0aff7e92331f86AB3C53314536"),
} satisfies Record<MonadNetwork, Address>;

export const factoryAddress = factoryAddresses.mainnet;
