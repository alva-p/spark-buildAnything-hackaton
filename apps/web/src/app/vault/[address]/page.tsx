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
import {
  monadChains,
  monadMainnet,
  monadTestnet,
  resolveVaultNetwork,
  type MonadNetwork,
} from "@/lib/monad";
import { parseMonAmount } from "@/lib/vault";

const statuses = ["Pending", "Active", "Cancelled"] as const;
type Action = "accept" | "deposit" | "claim";

export default function VaultPage() {
  const params = useParams<{ address: string }>();
  const validAddress = isAddress(params.address);
  const vaultAddress = validAddress ? getAddress(params.address) : zeroAddress;
  const { address: account, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [requestedNetwork, setRequestedNetwork] = useState<MonadNetwork | null>();
  const [localLabel, setLocalLabel] = useState<string>();
  const [depositAmount, setDepositAmount] = useState("");
  const [action, setAction] = useState<Action>();
  const [confirmedAction, setConfirmedAction] = useState<Action>();
  const [handledHash, setHandledHash] = useState<Hash>();
  const [actionError, setActionError] = useState<string>();
  const [addressCopied, setAddressCopied] = useState(false);
  const [observedAllocations, setObservedAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    const network = new URLSearchParams(window.location.search).get("network");
    setRequestedNetwork(network === "mainnet" || network === "testnet" ? network : null);
  }, [params.address]);

  const mainnetProbe = useReadContract({
    abi: vaultAbi,
    address: vaultAddress,
    functionName: "creator",
    chainId: monadMainnet.id,
    query: {
      enabled: validAddress && requestedNetwork !== undefined && requestedNetwork !== "testnet",
      retry: false,
    },
  });
  const testnetProbe = useReadContract({
    abi: vaultAbi,
    address: vaultAddress,
    functionName: "creator",
    chainId: monadTestnet.id,
    query: {
      enabled: validAddress && requestedNetwork !== undefined && requestedNetwork !== "mainnet",
      retry: false,
    },
  });
  const probesLoading =
    requestedNetwork === null && (mainnetProbe.isLoading || testnetProbe.isLoading);
  const vaultNetwork =
    requestedNetwork === undefined || probesLoading
      ? undefined
      : resolveVaultNetwork(
          requestedNetwork,
          Boolean(mainnetProbe.data),
          Boolean(testnetProbe.data),
        );
  const vaultChain = monadChains[vaultNetwork ?? "mainnet"];

  useEffect(() => {
    if (!vaultNetwork || requestedNetwork !== null) return;
    const url = new URL(window.location.href);
    url.searchParams.set("network", vaultNetwork);
    window.history.replaceState(null, "", url);
  }, [requestedNetwork, vaultNetwork]);

  const {
    data,
    error,
    isLoading,
    refetch: refetchVault,
  } = useReadContracts({
    allowFailure: false,
    contracts: [
      { abi: vaultAbi, address: vaultAddress, functionName: "status", chainId: vaultChain.id },
      { abi: vaultAbi, address: vaultAddress, functionName: "creator", chainId: vaultChain.id },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "reportCommitment",
        chainId: vaultChain.id,
      },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "getRecipients",
        chainId: vaultChain.id,
      },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "getSharesBps",
        chainId: vaultChain.id,
      },
      {
        abi: vaultAbi,
        address: vaultAddress,
        functionName: "acceptedCount",
        chainId: vaultChain.id,
      },
    ],
    query: { enabled: validAddress && Boolean(vaultNetwork), retry: false },
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
        chainId: vaultChain.id,
      })),
    [recipients, vaultAddress, vaultChain.id],
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
        chainId: vaultChain.id,
      })),
    [recipients, vaultAddress, vaultChain.id],
  );
  const {
    data: recipientClaimables,
    isLoading: recipientClaimablesLoading,
    refetch: refetchRecipientClaimables,
  } = useReadContracts({
    allowFailure: false,
    contracts: claimableContracts,
    query: {
      enabled: validAddress && claimableContracts.length > 0,
      refetchInterval: 4_000,
    },
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
    chainId: vaultChain.id,
    query: {
      enabled: validAddress && Boolean(vaultNetwork) && Boolean(account),
      refetchInterval: 4_000,
    },
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
  } = useWaitForTransactionReceipt({ hash, chainId: vaultChain.id });

  useEffect(() => {
    if (!validAddress || !vaultNetwork) return;
    setLocalLabel(undefined);
    setObservedAllocations({});
    try {
      const addressKey = vaultAddress.toLowerCase();
      const stored =
        localStorage.getItem(`auditsplit:vault:${vaultChain.id}:${addressKey}`) ??
        localStorage.getItem(`auditsplit:vault:${addressKey}`);
      if (stored) setLocalLabel(JSON.parse(stored).label);
      const payout =
        localStorage.getItem(`auditsplit:payout:${vaultChain.id}:${addressKey}`) ??
        localStorage.getItem(`auditsplit:payout:${addressKey}`);
      if (payout) {
        const parsed = JSON.parse(payout) as Record<string, unknown>;
        setObservedAllocations(
          Object.fromEntries(
            Object.entries(parsed).filter(
              ([, value]) => typeof value === "string" && /^\d+$/.test(value),
            ),
          ) as Record<string, string>,
        );
      }
    } catch {
      setLocalLabel(undefined);
      setObservedAllocations({});
    }
  }, [validAddress, vaultAddress, vaultChain.id, vaultNetwork]);

  useEffect(() => {
    if (!recipients || !recipientClaimables) return;

    setObservedAllocations((current) => {
      const next = { ...current };
      let changed = false;

      recipients.forEach((recipient, index) => {
        const amount = recipientClaimables[index] ?? BigInt(0);
        const key = recipient.toLowerCase();
        if (amount > BigInt(0) && next[key] !== amount.toString()) {
          next[key] = amount.toString();
          changed = true;
        }
      });

      if (!changed) return current;
      localStorage.setItem(
        `auditsplit:payout:${vaultChain.id}:${vaultAddress.toLowerCase()}`,
        JSON.stringify(next),
      );
      return next;
    });
  }, [recipientClaimables, recipients, vaultAddress, vaultChain.id]);

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
  const wrongNetwork = isConnected && chainId !== vaultChain.id;
  const busy = isWalletPending || isConfirming;
  const transactionError = actionError ??
    (confirmationError || writeError
      ? transactionErrorMessage(confirmationError ?? writeError)
      : undefined);
  const statusName = statuses[statusNumber] ?? "Unknown";
  const recipientStates = (recipients ?? []).map((recipient, index) => {
    const claimable = recipientClaimables?.[index] ?? BigInt(0);
    const observed = BigInt(observedAllocations[recipient.toLowerCase()] ?? "0");
    return {
      claimable,
      observed,
      claimed: observed > BigInt(0) && claimable === BigInt(0),
    };
  });
  const hasObservedPayout = recipientStates.some(
    ({ claimable, observed }) => claimable > BigInt(0) || observed > BigInt(0),
  );
  const claimedCount = recipientStates.filter(({ claimed }) => claimed).length;
  const splitComplete =
    recipientStates.length > 0 &&
    recipientStates.every(({ claimed }) => claimed);
  const remainingAcceptances = Math.max(
    (recipients?.length ?? 0) - Number(acceptedCount ?? 0),
    0,
  );
  const nextStepTitle = statusNumber === 0
    ? !isConnected
      ? "Connect a recipient wallet to continue"
      : isRecipient && !hasAccepted
        ? "Your acceptance is required"
        : `Waiting for ${remainingAcceptances} recipient${remainingAcceptances === 1 ? "" : "s"}`
    : statusNumber === 1
      ? splitComplete
        ? "Split successful"
        : nativeClaimable
          ? "Your share is ready to claim"
          : hasObservedPayout
            ? `${claimedCount} of ${recipients?.length ?? 0} shares claimed`
            : "Share this payout address"
      : "This payout pact is closed";
  const nextStepCopy = statusNumber === 0
    ? "The vault activates only after every listed recipient accepts the immutable split."
    : statusNumber === 1
      ? splitComplete
        ? "Every recipient received their agreed share. Thanks for using AuditSplit."
        : hasObservedPayout
          ? "The payout is allocated. Each remaining recipient can claim independently."
          : "Give this vault address to the bounty platform. Any MON it sends here is allocated by the accepted split."
      : "Cancelled vaults cannot accept deposits or reactivate.";

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
      chainId: vaultChain.id,
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
      chainId: vaultChain.id,
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
      chainId: vaultChain.id,
    });
  }

  async function copyVaultAddress() {
    try {
      await navigator.clipboard.writeText(vaultAddress);
      setAddressCopied(true);
    } catch {
      setActionError("Could not copy the vault address. Copy it from the explorer link instead.");
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="shell create-shell">

      <section className="create-heading vault-heading">
        <div className="eyebrow">
          PAYOUT VAULT · {vaultNetwork ? vaultChain.name.toUpperCase() : "LIVE MONAD STATE"}
        </div>
        <h1>{localLabel || "Vault case file."}</h1>
        {validAddress && vaultNetwork ? (
          <a
            className="mono-copy"
            href={`${vaultChain.blockExplorers.default.url}/address/${vaultAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            View vault on Monadscan ↗
          </a>
        ) : params.address}
      </section>

      {!validAddress ? (
        <section className="case-panel state-panel danger-text">Invalid vault address.</section>
      ) : requestedNetwork === undefined || probesLoading ? (
        <section className="case-panel state-panel">Finding this vault on Monad…</section>
      ) : !vaultNetwork ? (
        <section className="case-panel state-panel danger-text">
          Could not find an AuditSplit vault at this address on Monad Mainnet or Testnet.
        </section>
      ) : isLoading ? (
        <section className="case-panel state-panel">Reading the vault from {vaultChain.name}…</section>
      ) : error || !data ? (
        <section className="case-panel state-panel danger-text">
          Could not read a vault contract at this address. {error?.message}
        </section>
      ) : (
        <section className="case-panel create-panel">
          <div className="case-header">
            <span>AGREEMENT STATE</span>
            <span className={`status-pill status-${statusName.toLowerCase()}`}>
              {statusName}
            </span>
          </div>

          <div className="vault-lifecycle" aria-label="Payout lifecycle">
            <div className="lifecycle-step lifecycle-complete">
              <span>01</span>
              <div><strong>Pact created</strong><small>Terms locked</small></div>
            </div>
            <div className={`lifecycle-step${statusNumber === 0 ? " lifecycle-current" : statusNumber === 1 ? " lifecycle-complete" : ""}`}>
              <span>02</span>
              <div><strong>Accepted</strong><small>{Number(acceptedCount)} / {recipients?.length ?? 0} recipients</small></div>
            </div>
            <div className={`lifecycle-step${statusNumber === 1 ? hasObservedPayout ? " lifecycle-complete" : " lifecycle-current" : ""}`}>
              <span>03</span>
              <div><strong>Payout</strong><small>One vault address</small></div>
            </div>
            <div className={`lifecycle-step${splitComplete ? " lifecycle-complete" : hasObservedPayout ? " lifecycle-current" : ""}`}>
              <span>04</span>
              <div><strong>Claim</strong><small>{splitComplete ? "Split complete" : "Each share independently"}</small></div>
            </div>
          </div>

          <div className="primary-action" aria-live="polite">
            <div className="primary-action-copy">
              <span className="field-label">YOUR NEXT ACTION</span>
              <h2>{nextStepTitle}</h2>
              <p>{nextStepCopy}</p>
            </div>

            {statusNumber === 0 && (
              <div className="primary-action-control">
                <span className="muted-copy">
                  {!isConnected
                    ? "Only listed recipients can accept."
                    : !isRecipient
                      ? "The connected wallet is not a recipient."
                      : hasAccepted
                        ? "Your wallet already accepted."
                        : "Review the recipients and shares below before signing."}
                </span>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy || wrongNetwork || !isRecipient || hasAccepted || acceptancesLoading}
                  onClick={acceptAgreement}
                >
                  {isWalletPending && action === "accept"
                    ? "Confirm in wallet…"
                    : isConfirming && action === "accept"
                      ? "Confirming on Monad…"
                      : "Accept agreement"}
                </button>
              </div>
            )}

            {statusNumber === 1 && splitComplete && (
              <div className="split-success" role="status">
                <span className="split-success-mark" aria-hidden="true">✓</span>
                <div>
                  <span className="field-label">ALL CLAIMS CONFIRMED</span>
                  <strong>Split successful</strong>
                  <small>Funds reached every recipient.</small>
                </div>
              </div>
            )}

            {statusNumber === 1 && !splitComplete && hasObservedPayout && (
              <div className="claim-panel">
                <div
                  className="claim-progress"
                  role="progressbar"
                  aria-label={`${claimedCount} of ${recipients?.length ?? 0} recipients claimed`}
                  aria-valuemin={0}
                  aria-valuemax={recipients?.length ?? 0}
                  aria-valuenow={claimedCount}
                >
                  <strong>{claimedCount}/{recipients?.length ?? 0}</strong>
                  <span>recipients claimed</span>
                  <span className="claim-progress-track" aria-hidden="true">
                    <span style={{ width: `${(claimedCount / (recipients?.length || 1)) * 100}%` }} />
                  </span>
                </div>

                {nativeClaimable ? (
                  <div className="primary-action-control">
                    <strong className="claim-amount">
                      {nativeClaimableLoading ? "Reading…" : `${formatEther(nativeClaimable)} MON`}
                    </strong>
                    <span className="muted-copy">Your claim does not block the other recipient.</span>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy || wrongNetwork || !isConnected}
                      onClick={claimNative}
                    >
                      {isWalletPending && action === "claim"
                        ? "Confirm in wallet…"
                        : isConfirming && action === "claim"
                          ? "Confirming on Monad…"
                          : "Claim MON"}
                    </button>
                  </div>
                ) : (
                  <span className="muted-copy">Waiting for the remaining recipient wallets to claim.</span>
                )}
              </div>
            )}

            {statusNumber === 1 && !nativeClaimable && !hasObservedPayout && (
              <div className="primary-action-control payout-control">
                <span className="field-label">COPY THIS ADDRESS</span>
                <code className="payout-address">{vaultAddress}</code>
                <button className="button button-primary" type="button" onClick={copyVaultAddress}>
                  {addressCopied ? "Payout address copied" : "Copy payout address"}
                </button>
                <span className="muted-copy">The bounty payer sends MON here. Recipients do not fund the vault.</span>
              </div>
            )}

            {statusNumber === 2 && (
              <div className="primary-action-control">
                <span className="danger-text">No further actions are available for this vault.</span>
              </div>
            )}
          </div>

          {statusNumber === 1 && nativeClaimable && (
            <div className="payout-reference">
              <div>
                <span className="field-label">PAYOUT ADDRESS</span>
                <code>{vaultAddress}</code>
              </div>
              <button className="button button-secondary" type="button" onClick={copyVaultAddress}>
                {addressCopied ? "Copied" : "Copy address"}
              </button>
            </div>
          )}

          <div className="transaction-strip" aria-live="polite">
            {!isConnected && <span>Connect a wallet to accept, fund a payout, or claim.</span>}
            {wrongNetwork && (
              <>
                <span className="danger-text">Switch to {vaultChain.name} before signing.</span>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isSwitching}
                  onClick={() => switchChain({ chainId: vaultChain.id })}
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
                  href={`${vaultChain.blockExplorers.default.url}/tx/${hash}`}
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
                Confirmed · {confirmedAction === "accept" ? "agreement accepted" : confirmedAction === "deposit" ? "bounty allocated" : "claim completed"}.
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
              const recipientState = recipientStates[index];
              return (
                <div
                  className={`review-recipient vault-recipient${recipientState?.claimed ? " vault-recipient-claimed" : ""}`}
                  key={recipient}
                >
                  <div className="recipient-identity">
                    <code>{recipient}</code>
                    <span className="share-track" aria-hidden="true">
                      <span style={{ width: `${Number(shares?.[index]) / 100}%` }} />
                    </span>
                  </div>
                  <strong>{(Number(shares?.[index]) / 100).toFixed(2)}%</strong>
                  <span>
                    {recipientClaimablesLoading
                      ? "READING…"
                      : recipientState?.claimed
                        ? `${formatEther(recipientState.observed)} MON CLAIMED`
                        : `${formatEther(recipientState?.claimable ?? BigInt(0))} MON`}
                  </span>
                  <span className={`recipient-status${accepted ? " recipient-status-accepted" : ""}${recipientState?.claimable ? " recipient-status-ready" : ""}${recipientState?.claimed ? " recipient-status-claimed" : ""}`}>
                    {statusNumber !== 1 && acceptancesLoading
                      ? "READING…"
                      : recipientState?.claimed
                        ? "CLAIMED ✓"
                        : recipientState?.claimable
                          ? "CLAIM READY"
                          : accepted
                            ? "ACCEPTED"
                            : "PENDING"}
                  </span>
                </div>
              );
            })}
          </div>

          <details className="agreement-details">
            <summary>
              <span>AGREEMENT DETAILS</span>
              <span>Creator and private report commitment</span>
            </summary>
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
          </details>

          {statusNumber === 1 && (
            <details className="demo-tools">
              <summary>
                <span>PAYER TOOLS</span>
                <span>Send the bounty payment</span>
              </summary>
              <div className="demo-tools-content">
                <p className="demo-tools-note">
                  This sends real MON from the connected wallet and allocates it immediately using
                  the accepted split. Confirm the amount before signing.
                </p>
                <label>
                  <span>1 · Bounty amount</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.01"
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                  />
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || wrongNetwork || !isConnected}
                  onClick={depositNative}
                >
                  {isWalletPending && action === "deposit"
                    ? "Confirm in wallet…"
                    : isConfirming && action === "deposit"
                      ? "Confirming on Monad…"
                      : "2 · Send payout to vault"}
                </button>
              </div>
            </details>
          )}
        </section>
      )}

      <p className="privacy-note">
        Current balances and transaction states come directly from {vaultNetwork ? vaultChain.name : "Monad"}. Once
        observed, completed claim amounts are preserved only in this browser for the payout
        receipt. {vaultNetwork === "mainnet"
          ? "Mainnet MON has real-world value; confirm every amount and wallet prompt before signing."
          : "Testnet MON is for development only and has no real-world value."}
      </p>
      </main>
    </>
  );
}
