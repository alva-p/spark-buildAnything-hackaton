"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { SiteHeader } from "@/components/site-header";
import { factoryAbi, factoryAddress, vaultAbi } from "@/lib/contracts";
import { monadTestnet } from "@/lib/monad";

const steps = [
  ["01", "Define", "Set recipients and exact percentage shares. The private commitment is generated locally."],
  ["02", "Accept", "Every collaborator confirms the immutable split onchain before the pact activates."],
  ["03", "Share address", "Give the active vault address to the bounty platform as its single payout destination."],
  ["04", "Claim", "When the payer funds the vault, each researcher withdraws their exact share independently."],
] as const;

const vaultStatuses = ["Pending", "Active", "Cancelled"] as const;
const emptyVaults: readonly Address[] = [];

function shortAddress(address: Address) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function Home() {
  const { address: account } = useAccount();
  const [vaultLabels, setVaultLabels] = useState<Record<string, string>>({});
  const { data: vaults, isLoading: vaultsLoading } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress ?? zeroAddress,
    functionName: "getVaultsByCreator",
    args: [account ?? zeroAddress],
    chainId: monadTestnet.id,
    query: { enabled: Boolean(factoryAddress && account) },
  });
  const createdVaults = vaults ?? emptyVaults;
  const vaultContracts = useMemo(
    () =>
      createdVaults.flatMap((address) => [
        { abi: vaultAbi, address, functionName: "status" as const, chainId: monadTestnet.id },
        {
          abi: vaultAbi,
          address,
          functionName: "getRecipients" as const,
          chainId: monadTestnet.id,
        },
        {
          abi: vaultAbi,
          address,
          functionName: "getSharesBps" as const,
          chainId: monadTestnet.id,
        },
      ]),
    [createdVaults],
  );
  const { data: vaultDetails, isLoading: vaultDetailsLoading } = useReadContracts({
    allowFailure: false,
    contracts: vaultContracts,
    query: { enabled: vaultContracts.length > 0 },
  });

  useEffect(() => {
    const labels: Record<string, string> = {};
    createdVaults.forEach((vault) => {
      try {
        const stored = localStorage.getItem(`auditsplit:vault:${vault.toLowerCase()}`);
        const label = stored ? JSON.parse(stored).label : undefined;
        if (typeof label === "string" && label) labels[vault.toLowerCase()] = label;
      } catch {
        // Local labels are optional; live onchain history still renders without them.
      }
    });
    setVaultLabels(labels);
  }, [createdVaults]);

  return (
    <>
      <SiteHeader />
      <main className="shell landing-shell">
        <section className="hero" id="top">
          <div className="hero-content">
            <div className="eyebrow">COLLABORATIVE SECURITY PAYOUTS</div>
            <h1>
              Pact before <span>payout.</span>
            </h1>
            <p className="hero-copy">
              Lock the split before submission, then give the bounty platform one vault address.
              When it pays, every collaborator gets an independent claim.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary button-link" href="/create">
                Create payout vault <span aria-hidden="true">→</span>
              </Link>
              <a className="text-link" href="#workflow">
                See the payout flow ↓
              </a>
            </div>
            {factoryAddress && (
              <a
                className="deployment-proof"
                href={`${monadTestnet.blockExplorers.default.url}/address/${factoryAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>DEPLOYED + VERIFIED</span>
                <code>{factoryAddress.slice(0, 8)}…{factoryAddress.slice(-6)}</code>
                <span>MONAD TESTNET ↗</span>
              </a>
            )}
          </div>

          <aside className="case-panel payout-route" aria-label="AuditSplit payout route">
            <div className="case-header">
              <span>PAYOUT ROUTE</span>
              <span className="status-pill">NO MIDDLEMAN</span>
            </div>
            <div className="route-body">
              <div className="route-stop">
                <span className="route-index">01</span>
                <div>
                  <span className="field-label">BOUNTY PAYER</span>
                  <strong>Platform sends one payment</strong>
                </div>
              </div>
              <span className="route-connector" aria-hidden="true">↓</span>
              <div className="route-stop route-vault">
                <span className="route-index">02</span>
                <div>
                  <span className="field-label">UNIQUE VAULT ADDRESS</span>
                  <strong>Contract locks the accepted split</strong>
                  <code>0x… one address per report</code>
                </div>
              </div>
              <span className="route-connector" aria-hidden="true">↓</span>
              <div className="route-claims">
                <div>
                  <span className="field-label">RESEARCHER A</span>
                  <strong>Claims own share</strong>
                </div>
                <div>
                  <span className="field-label">RESEARCHER B</span>
                  <strong>Claims independently</strong>
                </div>
              </div>
            </div>
            <div className="route-footer">
              <span className="field-label">ONCHAIN</span>
              <strong>Immutable terms · 10,000 BPS · pull claims</strong>
            </div>
          </aside>
        </section>

        <section className="steps-grid" id="workflow" aria-label="AuditSplit workflow">
          {steps.map(([number, title, description]) => (
            <article className="step" key={number}>
              <div className="step-heading">
                <span className="step-number">{number}</span>
                <h2>{title}</h2>
              </div>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className="split-history" aria-labelledby="split-history-title">
          <div className="history-heading">
            <div>
              <span className="eyebrow">YOUR ONCHAIN HISTORY</span>
              <h2 id="split-history-title">Your payout vaults.</h2>
            </div>
            <span className="history-source">LIVE FROM MONAD</span>
          </div>

          {!account ? (
            <div className="history-empty">
              <strong>Connect your creator wallet</strong>
              <span>Your previous splits will appear here automatically.</span>
            </div>
          ) : vaultsLoading || vaultDetailsLoading ? (
            <div className="history-empty">
              <strong>Reading Monad Testnet…</strong>
              <span>Loading vaults created by {shortAddress(account)}.</span>
            </div>
          ) : createdVaults.length === 0 ? (
            <div className="history-empty">
              <strong>No splits created yet</strong>
              <span>Your first confirmed payout vault will be saved onchain here.</span>
            </div>
          ) : (
            <div className="history-list">
              {[...createdVaults].reverse().map((vault, reverseIndex) => {
                const index = createdVaults.length - reverseIndex - 1;
                const status = Number(vaultDetails?.[index * 3] ?? 0);
                const recipients = (vaultDetails?.[index * 3 + 1] ?? []) as readonly Address[];
                const shares = (vaultDetails?.[index * 3 + 2] ?? []) as readonly number[];

                return (
                  <Link className="history-card" href={`/vault/${vault}`} key={vault}>
                    <div className="history-card-top">
                      <div>
                        <span className="field-label">PAYOUT VAULT</span>
                        <strong>{vaultLabels[vault.toLowerCase()] || `Split ${index + 1}`}</strong>
                      </div>
                      <span className={`status-pill status-${(vaultStatuses[status] ?? "Unknown").toLowerCase()}`}>
                        {vaultStatuses[status] ?? "Unknown"}
                      </span>
                    </div>
                    <code>{vault}</code>
                    <div className="history-recipients">
                      {recipients.map((recipient, recipientIndex) => (
                        <span key={recipient}>
                          <code>{shortAddress(recipient)}</code>
                          <strong>{(Number(shares[recipientIndex] ?? 0) / 100).toFixed(2)}%</strong>
                        </span>
                      ))}
                    </div>
                    <span className="history-open">Open live vault →</span>
                  </Link>
                );
              })}
            </div>
          )}
          <p className="history-note">
            This list comes from the factory contract and follows the connected creator wallet.
            Friendly labels stay only in this browser.
          </p>
        </section>

        <section className="privacy-strip">
          <span className="privacy-icon" aria-hidden="true">◆</span>
          <div>
            <span className="field-label">PRIVACY GUARANTEE</span>
            <strong>No vulnerability details onchain.</strong>
            <p>Only a salted report commitment, recipient addresses and payout terms are stored.</p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <span>AUDITSPLIT — ONCHAIN PAYOUT PACTS</span>
          <span>Testnet MON has no real value.</span>
        </div>
      </footer>
    </>
  );
}
