import { parseEther } from "viem";

export function parseMonAmount(value: string) {
  try {
    const amount = parseEther(value.trim());
    return amount > BigInt(0) ? amount : "Enter an amount greater than 0 MON.";
  } catch {
    return "Enter a valid MON amount.";
  }
}
