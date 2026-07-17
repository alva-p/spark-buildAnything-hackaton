"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function compactAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        className="button button-wallet"
        type="button"
        title="Disconnect wallet"
        aria-label={`Disconnect wallet ${address}`}
        onClick={() => disconnect()}
      >
        <span className="wallet-dot wallet-dot-connected" />
        {compactAddress(address)}
      </button>
    );
  }

  const connector = connectors[0];
  return (
    <button
      className="button button-primary"
      disabled={!connector || isPending}
      onClick={() => connector && connect({ connector })}
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
