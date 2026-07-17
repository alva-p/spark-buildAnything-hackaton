"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { SiteHeader } from "@/components/site-header";
import { factoryAbi, factoryAddress, factoryAddresses, vaultAbi } from "@/lib/contracts";
import { monadChains, monadMainnet, monadTestnet, vaultHistoryEntries } from "@/lib/monad";

const steps = [
  ["01", "Define", "Set recipients and exact percentage shares. The private commitment is generated locally."],
  ["02", "Accept", "Every collaborator confirms the immutable split onchain before the pact activates."],
  ["03", "Share address", "Give the active vault address to the bounty platform as its single payout destination."],
  ["04", "Claim", "When the payer funds the vault, each researcher withdraws their exact share independently."],
] as const;

const vaultStatuses = ["Pending", "Active", "Cancelled"] as const;
const emptyVaults: readonly Address[] = [];
const exampleAccount: Address = "0x26F98D8Af2D99b1a8330bde564e5F9365eAb9588";
const exampleVaultLabels: Record<string, string> = {
  "mainnet:0x13265c83cd2ce8196f865884b3e8af1da23ba357": "BuildAnything",
  "testnet:0xf104a45b93e6129bde6676f271ed5b58e067aa82": "protocol A team 21",
  "testnet:0x153e06227ca6c64785e8fb0c9f7b9a5fe80bf37d": "team protocol A",
  "testnet:0x6cd726b6ee769fc357a6843016593aeb45fb8907": "Split 3",
  "testnet:0x6a81595f5be7a548932ba39bc7104769d7a806b5": "Split 2",
  "testnet:0x7e73b63b4b2b581567130110c85a9440d314e617": "Split 1",
};

type VaultEntry = {
  address: Address;
  network: keyof typeof monadChains;
  number: number;
};

function shortAddress(address: Address) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function VaultCards({
  vaults,
  details,
  labels,
}: {
  vaults: readonly VaultEntry[];
  details: readonly unknown[] | undefined;
  labels: Record<string, string>;
}) {
  return (
    <div className="history-list">
      {vaults.map(({ address: vault, network, number }, index) => {
        const status = Number(details?.[index * 3] ?? 0);
        const recipients = (details?.[index * 3 + 1] ?? []) as readonly Address[];
        const shares = (details?.[index * 3 + 2] ?? []) as readonly number[];

        return (
          <Link
            className="history-card"
            href={`/vault/${vault}?network=${network}`}
            key={`${network}:${vault}`}
          >
            <div className="history-card-top">
              <div>
                <span className="field-label">PAYOUT VAULT · {monadChains[network].name}</span>
                <strong>{labels[`${network}:${vault.toLowerCase()}`] || `Split ${number}`}</strong>
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
  );
}

function useCreatorVaults(account?: Address) {
  const mainnet = useReadContract({
    abi: factoryAbi,
    address: factoryAddresses.mainnet,
    functionName: "getVaultsByCreator",
    args: [account ?? zeroAddress],
    chainId: monadMainnet.id,
    query: { enabled: Boolean(account) },
  });
  const testnet = useReadContract({
    abi: factoryAbi,
    address: factoryAddresses.testnet,
    functionName: "getVaultsByCreator",
    args: [account ?? zeroAddress],
    chainId: monadTestnet.id,
    query: { enabled: Boolean(account) },
  });
  const vaults = useMemo(
    () => vaultHistoryEntries(mainnet.data ?? emptyVaults, testnet.data ?? emptyVaults),
    [mainnet.data, testnet.data],
  );
  const contracts = useMemo(
    () =>
      vaults.flatMap(({ address, network }) => [
        { abi: vaultAbi, address, functionName: "status" as const, chainId: monadChains[network].id },
        { abi: vaultAbi, address, functionName: "getRecipients" as const, chainId: monadChains[network].id },
        { abi: vaultAbi, address, functionName: "getSharesBps" as const, chainId: monadChains[network].id },
      ]),
    [vaults],
  );
  const details = useReadContracts({
    allowFailure: false,
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  return {
    vaults,
    details: details.data,
    isLoading: mainnet.isLoading || testnet.isLoading || details.isLoading,
    isError: mainnet.isError || testnet.isError || details.isError,
  };
}

export default function Home() {
  const { address: account } = useAccount();
  const [vaultLabels, setVaultLabels] = useState<Record<string, string>>({});
  const {
    vaults: createdVaults,
    details: vaultDetails,
    isLoading: vaultsLoading,
  } = useCreatorVaults(account);
  const {
    vaults: exampleVaults,
    details: exampleVaultDetails,
    isLoading: exampleVaultsLoading,
    isError: exampleVaultsError,
  } = useCreatorVaults(exampleAccount);

  useEffect(() => {
    const labels: Record<string, string> = {};
    createdVaults.forEach(({ address: vault, network }) => {
      try {
        const addressKey = vault.toLowerCase();
        const stored =
          localStorage.getItem(`auditsplit:vault:${monadChains[network].id}:${addressKey}`) ??
          localStorage.getItem(`auditsplit:vault:${addressKey}`);
        const label = stored ? JSON.parse(stored).label : undefined;
        if (typeof label === "string" && label) labels[`${network}:${addressKey}`] = label;
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
                Create payout vault
              </Link>
            </div>
            <a
              className="deployment-proof"
              href={`${monadMainnet.blockExplorers.default.url}/address/${factoryAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              <span>DEPLOYED + VERIFIED</span>
              <code>{factoryAddress.slice(0, 8)}…{factoryAddress.slice(-6)}</code>
              <span>MONAD MAINNET ↗</span>
            </a>
          </div>

          <aside className="case-panel payout-route" aria-label="AuditSplit payout route">
            <div className="case-header">
              <span>PAYOUT ROUTE</span>
              <span className="status-pill">NO MIDDLEMAN</span>
            </div>
            <div className="route-body">
              <div className="route-stop">
                <span className="route-index">
                  <span aria-hidden="true">🏆</span>
                  <small>01</small>
                </span>
                <div>
                  <span className="field-label">BOUNTY PAYER</span>
                  <strong>Platform sends one payment</strong>
                </div>
              </div>
              <span className="route-connector" aria-hidden="true">↓</span>
              <div className="route-stop route-vault">
                <span className="route-index">
                  <span aria-hidden="true">🔐</span>
                  <small>02</small>
                </span>
                <div>
                  <span className="field-label">UNIQUE VAULT ADDRESS</span>
                  <strong>Contract locks the accepted split</strong>
                  <code>0x… one address per report</code>
                </div>
              </div>
              <span className="route-connector" aria-hidden="true">↓</span>
              <div className="route-claims">
                <div>
                  <span className="route-claim-icon" aria-hidden="true">🧑‍💻</span>
                  <span className="field-label">RESEARCHER A</span>
                  <strong>Claims own share</strong>
                </div>
                <div>
                  <span className="route-claim-icon" aria-hidden="true">👩‍💻</span>
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
          ) : vaultsLoading ? (
            <div className="history-empty">
              <strong>Reading Monad Mainnet and Testnet…</strong>
              <span>Loading vaults created by {shortAddress(account)}.</span>
            </div>
          ) : createdVaults.length === 0 ? (
            <div className="history-empty">
              <strong>No splits created yet</strong>
              <span>Your first confirmed payout vault will be saved onchain here.</span>
            </div>
          ) : (
            <VaultCards vaults={createdVaults} details={vaultDetails} labels={vaultLabels} />
          )}
          <p className="history-note">
            This list comes from the Mainnet and Testnet factory contracts and follows the
            connected creator wallet. Friendly labels stay only in this browser.
          </p>
        </section>

        <section className="split-history" aria-labelledby="examples-title">
          <div className="history-heading">
            <div>
              <span className="eyebrow">VERIFIED ONCHAIN DEMOS</span>
              <h2 id="examples-title">Examples.</h2>
            </div>
            <span className="history-source">LIVE FROM MONAD</span>
          </div>

          {exampleVaultsLoading ? (
            <div className="history-empty">
              <strong>Reading live examples…</strong>
              <span>Loading verified vaults from Monad Mainnet and Testnet.</span>
            </div>
          ) : exampleVaultsError ? (
            <div className="history-empty">
              <strong>Live examples are temporarily unavailable</strong>
              <span>Monad RPC data could not be loaded. Please try again shortly.</span>
            </div>
          ) : (
            <VaultCards vaults={exampleVaults} details={exampleVaultDetails} labels={exampleVaultLabels} />
          )}
          <p className="history-note">
            These examples are read live from Monad for creator {shortAddress(exampleAccount)}. Friendly labels
            are local; statuses, recipients, and shares come directly from each vault contract.
          </p>
        </section>

      </main>

      <footer className="site-footer">
        <div>
          <span>AUDITSPLIT — BUILT BY ALVA-P</span>
          <nav className="footer-links" aria-label="Álvaro Pineda links">
            <a href="https://github.com/alva-p" target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://www.linkedin.com/in/%C3%A1lvaro-pineda/" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="https://x.com/pimmpi_" target="_blank" rel="noreferrer">X / Twitter</a>
            <a href="mailto:alvaropineda1017@gmail.com">Email</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
