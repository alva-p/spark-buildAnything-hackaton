import Image from "next/image";
import Link from "next/link";
import { WalletButton } from "@/components/wallet-button";

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="nav-inner">
        <div className="nav-identity">
          <Link className="brand" href="/" aria-label="AuditSplit home">
            <Image className="brand-image" src="/icon.png" alt="" width={40} height={35} priority />
            <span>AuditSplit</span>
          </Link>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
