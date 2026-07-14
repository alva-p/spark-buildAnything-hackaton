"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatEther, getAddress, isAddress, zeroAddress, type Hash } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { SiteHeader } from "@/components/site-header";
import { vaultAbi } from "@/lib/contracts";
import { transactionErrorMessage } from "@/lib/errors";
import { monadTestnet } from "@/lib/monad";
import { parseMonAmount } from "@/lib/vault";

const statuses = ["Pending", "Active", "Cancelled"] as const;
type Action = "accept" | "deposit" | "claim";

export default function VaultPage() {
  const params = useParams<{ address: string }>();
  const validAddress = isAddress(params.address);
  const vaultAddress = validAddress ? getAddress(params.address) : zeroAddress;
  const { address: account, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [localLabel, setLocalLabel] = useState<string>();
  const [depositAmount, setDepositAmount] = useState("0.1");
  const [action, setAction] = useState<Action>();
  const [confirmedAction, setConfirmedAction] = useState<Action>();
  const [handledHash, setHandledHash] = useState<Hash>();
  const [actionError, setActionError] = useState<string>();

  const {
    data,
    error,
    isLoading,
    refetch: refetchVault,
  } = useReadContracts({
    allowFailure: false,
    contracts: [
      { abi: vaultAbi, address: vaultAddress, functionName: "status", chainId: monadTestnet.id },
      { abi: vaultAbi, address: vaultAddress, functionName: "creator", chainId: monadTestnet.id },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "reportCommitment",
        chainId: monadTestnet.id,
      },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "getRecipients",
        chainId: monadTestnet.id,
      },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "getSharesBps",
        chainId: monadTestnet.id,
      },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "acceptedCount",
        chainId: monadTestnet.id,
      },
    ],
    query: { enabled: validAddress },
  });

  const [status, creator, commitment, recipients, shares, acceptedCount] = data ?? [];
  const statusNumber = Number(status);
  const acceptanceContracts = useMemo(
    () =>
      (recipients ?? []).map((recipient) => ({
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "hasAccepted" as const,
        args: [recipient] as const,
        chainId: monadTestnet.id,
      })),
    [recipients, vaultAddress],
  );
  const {
    data: acceptances,
    isLoading: acceptancesLoading,
    refetch: refetchAcceptances,
  } = useReadContracts({
    allowFailure: false,
    contracts: acceptanceContracts,
    query: { enabled: validAddress && acceptanceContracts.length > 0 },
  });
  const claimableContracts = useMemo(
    () =>
      (recipients ?? []).map((recipient) => ({
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "claimable" as const,
        args: [zeroAddress, recipient] as const,
        chainId: monadTestnet.id,
      })),
    [recipients, vaultAddress],
  );
  const {
    data: recipientClaimables,
    isLoading: recipientClaimablesLoading,
    refetch: refetchRecipientClaimables,
  } = useReadContracts({
      allowFailure: false,
      contracts: claimableContracts,
      query: { enabled: validAddress && claimableContracts.length > 0 },
    });
  const {
    data: nativeClaimable,
    isLoading: nativeClaimableLoading,
    refetch: refetchClaimable,
  } = useReadContract({
    abi: vaultAbi,
    address: vaultAddress,
    functionName: "claimable",
    args: [zeroAddress, account ?? zeroAddress],
    chainId: monadTestnet.id,
    query: { enabled: validAddress && Boolean(account) },
  });

  const {
    data: hash,
    error: writeError,
    isPending: isWalletPending,
    reset: resetWrite,
    writeContract,
  } = useWriteContract();
  const {
    data: receipt,
    error: confirmationError,
    isLoading: isConfirming,
  } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!validAddress) return;
    try {
      const stored = localStorage.getItem(`auditsplit:vault:${vaultAddress.toLowerCase()}`);
      if (stored) setLocalLabel(JSON.parse(stored).label);
    } catch {
      setLocalLabel(undefined);
    }
  }, [validAddress, vaultAddress]);

  useEffect(() => {
    if (!receipt || receipt.transactionHash === handledHash) return;
    setHandledHash(receipt.transactionHash);
    setConfirmedAction(action);
    void Promise.all([
      refetchVault(),
      refetchAcceptances(),
      refetchClaimable(),
      refetchRecipientClaimables(),
    ]);
  }, [
    action,
    handledHash,
    receipt,
    refetchAcceptances,
    refetchClaimable,
    refetchRecipientClaimables,
    refetchVault,
  ]);

  const recipientIndex =
    account && recipients
      ? recipients.findIndex((recipient) => recipient.toLowerCase() === account.toLowerCase())
      : -1;
  const isRecipient = recipientIndex >= 0;
  const hasAccepted =
    statusNumber === 1 || (recipientIndex >= 0 && Boolean(acceptances?.[recipientIndex]));
  const wrongNetwork = isConnected && chainId !== monadTestnet.id;
  const busy = isWalletPending || isConfirming;
  const transactionError = actionError ??
    (confirmationError || writeError
      ? transactionErrorMessage(confirmationError ?? writeError)
      : undefined);

  function prepareAction(nextAction: Action) {
    resetWrite();
    setAction(nextAction);
    setConfirmedAction(undefined);
    setActionError(undefined);
  }

  function acceptAgreement() {
    if (!isConnected || wrongNetwork || statusNumber !== 0 || !isRecipient || hasAccepted) return;
    prepareAction("accept");
    writeContract({
      abi: vaultAbi,
      address: vaultAddress,
      functionName: "acceptAgreement",
      chainId: monadTestnet.id,
    });
  }

  function depositNative() {
    if (!isConnected || wrongNetwork || statusNumber !== 1) return;
    const value = parseMonAmount(depositAmount);
    if (typeof value === "string") return setActionError(value);

    prepareAction("deposit");
    writeContract({
      abi: vaultAbi,
      address: vaultAddress,
      functionName: "depositNative",
      value,
      chainId: monadTestnet.id,
    });
  }

  function claimNative() {
    if (!isConnected || wrongNetwork || !nativeClaimable) return;
    prepareAction("claim");
    writeContract({
      abi: vaultAbi,
      address: vaultAddress,
      functionName: "claim",
      args: [zeroAddress],
      chainId: monadTestnet.id,
    });
  }

  return (
    <>
      <SiteHeader />
      <main className="shell create-shell">

      <section className="create-heading vault-heading">
        <div className="eyebrow">PAYOUT VAULT · LIVE MONAD STATE</div>
        <h1>{localLabel || "Vault case file."}</h1>
        <p className="hero-copy mono-copy">
          {validAddress ? (
            <a
              href={`${monadTestnet.blockExplorers.default.url}/address/${vaultAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              {vaultAddress}
            </a>
          ) : params.address}
        </p>
      </section>

      {!validAddress ? (
        <section className="case-panel state-panel danger-text">Invalid vault address.</section>
      ) : isLoading ? (
        <section className="case-panel state-panel">Reading the vault from Monad Testnet…</section>
      ) : error || !data ? (
        <section className="case-panel state-panel danger-text">
          Could not read a vault contract at this address. {error?.message}
        </section>
      ) : (
        <section className="case-panel create-panel">
          <div className="case-header">
            <span>AGREEMENT STATE</span>
            <span className={statusNumber === 1 ? "status-dot" : ""}>
              {statuses[statusNumber] ?? "Unknown"}
            </span>
          </div>

          <div className="review-summary vault-summary">
            <div>
              <span className="field-label">CREATOR</span>
              <code>{creator}</code>
            </div>
            <div>
              <span className="field-label">ACCEPTANCE</span>
              <strong>{Number(acceptedCount)} / {recipients?.length ?? 0}</strong>
            </div>
            <div className="wide-field">
              <span className="field-label">REPORT COMMITMENT</span>
              <code>{commitment}</code>
            </div>
          </div>

          <div className="case-header section-divider">
            <span>LIVE ACTIONS</span>
            <span>TESTNET MON · NO REAL VALUE</span>
          </div>
          <div className="vault-actions">
            <article className="action-card">
              <span className="field-label">01 · ACCEPT PACT</span>
              <strong>
                {!isConnected
                  ? "Connect a recipient wallet"
                  : !isRecipient
                    ? "Connected wallet is not a recipient"
                    : hasAccepted
                      ? "Agreement accepted"
                      : "Review the immutable split, then accept"}
              </strong>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  busy ||
                  wrongNetwork ||
                  statusNumber !== 0 ||
                  !isRecipient ||
                  hasAccepted ||
                  acceptancesLoading
                }
                onClick={acceptAgreement}
              >
                {isWalletPending && action === "accept" ? "Confirm in wallet…" : "Accept agreement"}
              </button>
            </article>

            <article className="action-card">
              <span className="field-label">02 · FUND VAULT</span>
              <label>
                <span>Testnet MON amount</span>
                <input
                  inputMode="decimal"
                  value={depositAmount}
                  disabled={statusNumber !== 1}
                  onChange={(event) => setDepositAmount(event.target.value)}
                />
              </label>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || wrongNetwork || !isConnected || statusNumber !== 1}
                onClick={depositNative}
              >
                {isWalletPending && action === "deposit" ? "Confirm in wallet…" : "Deposit test MON"}
              </button>
              <a href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">
                Get Testnet MON from the official faucet ↗
              </a>
            </article>

            <article className="action-card claim-card">
              <span className="field-label">03 · YOUR CLAIM</span>
              <strong className="claim-amount">
                {!isConnected
                  ? "Connect wallet"
                  : nativeClaimableLoading
                    ? "Reading…"
                    : `${formatEther(nativeClaimable ?? BigInt(0))} MON`}
              </strong>
              <span className="muted-copy">Claiming does not affect any other recipient.</span>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || wrongNetwork || !isConnected || !nativeClaimable}
                onClick={claimNative}
              >
                {isWalletPending && action === "claim" ? "Confirm in wallet…" : "Claim test MON"}
              </button>
            </article>
          </div>

          <div className="transaction-strip" aria-live="polite">
            {!isConnected && <span>Connect a wallet to use vault actions.</span>}
            {wrongNetwork && (
              <>
                <span className="danger-text">Switch to Monad Testnet before signing.</span>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isSwitching}
                  onClick={() => switchChain({ chainId: monadTestnet.id })}
                >
                  {isSwitching ? "Switching…" : "Switch network"}
                </button>
              </>
            )}
            {isWalletPending && <span className="status-dot">Confirm the action in your wallet…</span>}
            {hash && !confirmedAction && !isWalletPending && !writeError && (
              <span>
                Submitted ·{" "}
                <a
                  href={`${monadTestnet.blockExplorers.default.url}/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {hash.slice(0, 10)}…{hash.slice(-8)}
                </a>
                {isConfirming ? " · waiting for confirmation" : ""}
              </span>
            )}
            {confirmedAction && (
              <span className="status-dot">
                Confirmed · {confirmedAction === "accept" ? "agreement accepted" : confirmedAction === "deposit" ? "funds allocated" : "claim completed"}.
              </span>
            )}
            {transactionError && <span className="danger-text">{transactionError}</span>}
          </div>

          <div className="case-header section-divider">
            <span>RECIPIENTS</span>
            <span>IMMUTABLE SHARES</span>
          </div>
          <div className="review-recipients">
            {recipients?.map((recipient, index) => {
              const accepted = statusNumber === 1 || Boolean(acceptances?.[index]);
              return (
                <div className="review-recipient vault-recipient" key={recipient}>
                  <code>{recipient}</code>
                  <strong>{(Number(shares?.[index]) / 100).toFixed(2)}%</strong>
                  <span>
                    {recipientClaimablesLoading
                      ? "READING…"
                      : `${formatEther(recipientClaimables?.[index] ?? BigInt(0))} MON`}
                  </span>
                  <span className={accepted ? "status-dot" : ""}>
                    {statusNumber !== 1 && acceptancesLoading
                      ? "READING…"
                      : accepted
                        ? "ACCEPTED"
                        : "PENDING"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="privacy-note">
        All balances and transaction states above come directly from Monad Testnet. Testnet MON is
        for development only and has no real-world value.
      </p>
      </main>
    </>
  );
}
