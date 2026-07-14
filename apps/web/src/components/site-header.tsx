import Link from "next/link";
import { WalletButton } from "@/components/wallet-button";

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="nav-inner">
        <div className="nav-identity">
          <Link className="brand" href="/" aria-label="AuditSplit home">
            <span className="brand-mark" aria-hidden="true">
              <span className="brand-cut" />
              <span className="brand-node brand-node-left" />
              <span className="brand-node brand-node-right" />
            </span>
            <span>AuditSplit</span>
          </Link>
          <span className="network-badge">
            <span className="network-dot" />
            MONAD TESTNET
          </span>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
