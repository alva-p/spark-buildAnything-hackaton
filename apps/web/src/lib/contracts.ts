import { getAddress, isAddress, type Address } from "viem";
export { factoryAbi, vaultAbi } from "@/generated/abis";

const configuredAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;

export const factoryAddress: Address | undefined =
  configuredAddress && isAddress(configuredAddress)
    ? getAddress(configuredAddress)
    : undefined;
