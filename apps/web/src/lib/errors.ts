import { BaseError, ContractFunctionRevertedError } from "viem";

export function transactionErrorMessage(error: unknown) {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName
        ? `Contract reverted: ${reverted.data.errorName}`
        : reverted.shortMessage;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "The transaction failed.";
}
