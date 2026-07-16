import { getAddress, type Address } from "viem";
export { factoryAbi, vaultAbi } from "@/generated/abis";

export const factoryAddress: Address = getAddress(
  "0x0ccbe83afD8423baE0094857B3D97cAec9B52D0C",
);
