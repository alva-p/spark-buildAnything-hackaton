import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const steps = [
  ["01", "Define", "Set recipients and exact percentage shares. The private commitment is generated locally."],
  ["02", "Accept", "Every collaborator confirms the immutable split onchain before the pact activates."],
  ["03", "Fund", "Use the dedicated vault as the reward destination and allocate Testnet MON automatically."],
  ["04", "Claim", "Each researcher withdraws independently without affecting anyone else's balance."],
] as const;

const guarantees = [
  ["TERMS", "Immutable after deployment"],
  ["ACTIVATION", "Unanimous recipient consent"],
  ["PAYOUT", "Independent pull claims"],
] as const;

export default function Home() {
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
              Before a private bug report goes out, every collaborator locks their share onchain.
              The vault receives the bounty in Testnet MON, and each researcher claims
              independently.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary button-link" href="/create">
                Create payout vault <span aria-hidden="true">→</span>
              </Link>
              <a
                className="text-link"
                href="https://faucet.monad.xyz/"
                target="_blank"
                rel="noreferrer"
              >
                Get Testnet MON ↗
              </a>
            </div>
          </div>

          <aside className="case-panel hero-dossier" aria-label="AuditSplit protocol guarantees">
            <div className="case-header">
              <span>CASE FILE // PAYOUT PROTOCOL</span>
              <span className="status-pill">ONCHAIN</span>
            </div>
            <div className="dossier-commitment">
              <span className="field-label">PRIVACY BOUNDARY</span>
              <code>bytes32 reportCommitment</code>
              <p>No title, report ID or vulnerability detail ever reaches the chain.</p>
            </div>
            <div className="dossier-rules">
              {guarantees.map(([label, value]) => (
                <div className="dossier-rule" key={label}>
                  <span className="evidence-dot" />
                  <div>
                    <span className="field-label">{label}</span>
                    <strong>{value}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div className="split-proof">
              <div>
                <span className="field-label">SPLIT INVARIANT</span>
                <code>10,000 BPS</code>
              </div>
              <div className="evidence-bar"><span /></div>
            </div>
          </aside>
        </section>

        <section className="steps-grid" aria-label="AuditSplit workflow">
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
