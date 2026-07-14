"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { SiteHeader } from "@/components/site-header";
import { factoryAbi, factoryAddress } from "@/lib/contracts";
import { transactionErrorMessage } from "@/lib/errors";
import {
  percentageToBps,
  randomSalt,
  reportCommitment,
  validateSplit,
  type RecipientDraft,
} from "@/lib/create-vault";
import { monadTestnet } from "@/lib/monad";

const emptyRows: RecipientDraft[] = [
  { address: "", percentage: "50" },
  { address: "", percentage: "50" },
];

export default function CreateVaultPage() {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [label, setLabel] = useState("");
  const [platform, setPlatform] = useState("");
  const [privateReportId, setPrivateReportId] = useState("");
  const [rows, setRows] = useState<RecipientDraft[]>(emptyRows);
  const [salt, setSalt] = useState<Hex>();
  const [reviewing, setReviewing] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [receiptError, setReceiptError] = useState<string>();
  const [createdVault, setCreatedVault] = useState<Address>();

  const validation = useMemo(() => validateSplit(rows), [rows]);
  const split = typeof validation === "string" ? undefined : validation;
  const totalBps = rows.reduce(
    (total, row) => total + (percentageToBps(row.percentage) ?? 0),
    0,
  );
  const commitment = useMemo(
    () =>
      salt && privateReportId.trim()
        ? reportCommitment(platform, privateReportId, salt)
        : undefined,
    [platform, privateReportId, salt],
  );

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
    if (!address) return;
    setRows((current) =>
      current[0].address ? current : [{ ...current[0], address }, ...current.slice(1)],
    );
  }, [address]);

  useEffect(() => {
    if (!receipt || !commitment || !address || !factoryAddress || createdVault) return;

    try {
      const expectedFactory = factoryAddress.toLowerCase();
      const expectedCreator = address.toLowerCase();
      const event = parseEventLogs({
        abi: factoryAbi,
        eventName: "VaultCreated",
        logs: receipt.logs,
      }).find(
        (log) =>
          log.address.toLowerCase() === expectedFactory &&
          log.args.creator.toLowerCase() === expectedCreator &&
          log.args.reportCommitment === commitment,
      );

      if (!event) throw new Error("Confirmed receipt did not contain the expected VaultCreated event.");

      const vault = event.args.vault;
      localStorage.setItem(
        `auditsplit:vault:${vault.toLowerCase()}`,
        JSON.stringify({ label: label.trim(), salt, commitment, createdAt: Date.now() }),
      );
      setCreatedVault(vault);
      setReceiptError(undefined);
    } catch (error) {
      setReceiptError(transactionErrorMessage(error));
    }
  }, [address, commitment, createdVault, label, receipt, salt]);

  useEffect(() => {
    if (!createdVault) return;
    const redirect = window.setTimeout(() => router.replace(`/vault/${createdVault}`), 900);
    return () => window.clearTimeout(redirect);
  }, [createdVault, router]);

  function updateRow(index: number, field: keyof RecipientDraft, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  function openReview() {
    if (!label.trim()) return setFormError("Add a friendly local label.");
    if (!privateReportId.trim()) return setFormError("Add the private report ID used for the commitment.");
    if (!split) return setFormError(validation as string);

    setSalt((current) => current ?? randomSalt());
    setFormError(undefined);
    setReviewing(true);
  }

  function createVault() {
    if (!factoryAddress || !split || !commitment || !isConnected || chainId !== monadTestnet.id) {
      return;
    }

    setReceiptError(undefined);
    writeContract({
      abi: factoryAbi,
      address: factoryAddress,
      functionName: "createVault",
      args: [commitment, split.recipients, split.sharesBps],
      chainId: monadTestnet.id,
    });
  }

  function editAgreement() {
    resetWrite();
    setReceiptError(undefined);
    setCreatedVault(undefined);
    setReviewing(false);
  }

  const transactionError =
    receiptError ?? transactionErrorMessage(confirmationError ?? writeError);
  const hasTransactionError = Boolean(receiptError || confirmationError || writeError);
  const writesBlocked =
    isWalletPending || isConfirming || Boolean(hash && !confirmationError);

  return (
    <>
      <SiteHeader />
      <main className="shell create-shell">

      <section className="create-heading">
        <div className="eyebrow">CASE INTAKE · NEW PAYOUT PACT</div>
        <h1>Create vault.</h1>
        <p className="hero-copy">
          Lock exact collaborator shares before report submission. Only a salted commitment and
          payout terms reach Monad.
        </p>
      </section>

      {!reviewing ? (
        <section className="case-panel create-panel">
          <div className="case-header">
            <span>01 · AGREEMENT DETAILS</span>
            <span>LOCAL INPUT</span>
          </div>

          <div className="form-section two-column-fields">
            <label>
              <span>Friendly label · stored locally</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Oracle review pact" />
            </label>
            <label>
              <span>Platform · commitment input, not stored</span>
              <input value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="Immunefi" />
            </label>
            <label className="wide-field">
              <span>Private report ID · commitment input, not stored</span>
              <input
                type="password"
                autoComplete="off"
                value={privateReportId}
                onChange={(event) => setPrivateReportId(event.target.value)}
                placeholder="Never sent or persisted"
              />
            </label>
          </div>

          <div className="case-header section-divider">
            <span>02 · RECIPIENTS</span>
            <span className={totalBps === 10_000 ? "status-dot" : "danger-text"}>
              TOTAL {(totalBps / 100).toFixed(2)}%
            </span>
          </div>

          <div className="form-section recipient-list">
            {rows.map((row, index) => (
              <div className="recipient-row" key={index}>
                <span className="row-number">{String(index + 1).padStart(2, "0")}</span>
                <label>
                  <span>Wallet address</span>
                  <input
                    className="mono-input"
                    value={row.address}
                    onChange={(event) => updateRow(index, "address", event.target.value)}
                    placeholder="0x…"
                  />
                </label>
                <label className="share-field">
                  <span>Share %</span>
                  <input
                    inputMode="decimal"
                    value={row.percentage}
                    onChange={(event) => updateRow(index, "percentage", event.target.value)}
                    placeholder="50"
                  />
                </label>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove recipient ${index + 1}`}
                  disabled={rows.length === 2}
                  onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              className="button button-secondary add-recipient"
              type="button"
              disabled={rows.length === 10}
              onClick={() => setRows((current) => [...current, { address: "", percentage: "" }])}
            >
              + Add recipient
            </button>
          </div>

          <div className="form-footer">
            <p className={formError ? "form-message error-message" : "form-message"} aria-live="polite">
              {formError ?? (typeof validation === "string" ? validation : "Agreement input is valid.")}
            </p>
            <button className="button button-primary" type="button" onClick={openReview}>
              Review exact pact
            </button>
          </div>
        </section>
      ) : (
        <section className="case-panel create-panel">
          <div className="case-header">
            <span>03 · FINAL REVIEW</span>
            <span className="status-dot">READY FOR SIGNATURE</span>
          </div>

          <div className="review-summary">
            <div>
              <span className="field-label">LOCAL LABEL</span>
              <strong>{label}</strong>
            </div>
            <div>
              <span className="field-label">NETWORK</span>
              <strong>Monad Testnet · {monadTestnet.id}</strong>
            </div>
            <div className="wide-field">
              <span className="field-label">REPORT COMMITMENT · ONCHAIN</span>
              <code>{commitment}</code>
            </div>
            <div className="wide-field">
              <span className="field-label">RANDOM SALT · LOCAL STORAGE AFTER CONFIRMATION</span>
              <code>{salt}</code>
            </div>
          </div>

          <div className="review-recipients">
            {split?.recipients.map((recipient, index) => (
              <div className="review-recipient" key={recipient}>
                <code>{recipient}</code>
                <strong>{(split.sharesBps[index] / 100).toFixed(2)}%</strong>
                <span>{split.sharesBps[index]} BPS</span>
              </div>
            ))}
          </div>

          <div className="transaction-strip" aria-live="polite">
            {!isConnected && <span>Connect a wallet to continue.</span>}
            {isConnected && chainId !== monadTestnet.id && (
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
            {!factoryAddress && (
              <span className="danger-text">Set a valid NEXT_PUBLIC_FACTORY_ADDRESS to enable creation.</span>
            )}
            {isWalletPending && <span className="status-dot">Confirm the transaction in your wallet…</span>}
            {hash && !createdVault && (
              <span>
                Submitted ·{" "}
                <a href={`${monadTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">
                  {hash.slice(0, 10)}…{hash.slice(-8)}
                </a>
                {isConfirming ? " · waiting for confirmation" : ""}
              </span>
            )}
            {createdVault && <span className="status-dot">Confirmed · vault {createdVault} created. Redirecting…</span>}
            {hasTransactionError && <span className="danger-text">{transactionError}</span>}
          </div>

          <div className="form-footer">
            <button className="button button-secondary" type="button" disabled={writesBlocked} onClick={editAgreement}>
              Edit agreement
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={
                !factoryAddress ||
                !split ||
                !commitment ||
                !isConnected ||
                chainId !== monadTestnet.id ||
                writesBlocked
              }
              onClick={createVault}
            >
              {isWalletPending ? "Confirm in wallet…" : isConfirming ? "Confirming…" : "Create vault onchain"}
            </button>
          </div>
        </section>
      )}

      <p className="privacy-note">
        Private report IDs remain in this tab only. AuditSplit never sends them to the contract or
        local storage.
      </p>
      </main>
    </>
  );
}
