"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/monad";

function compactAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (isConnected && chainId !== monadTestnet.id) {
    return (
      <button
        className="button button-warning"
        disabled={isSwitching}
        onClick={() => switchChain({ chainId: monadTestnet.id })}
      >
        <span className="wallet-dot" />
        {isSwitching ? "Switching…" : "Switch to Monad Testnet"}
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button className="button button-wallet" onClick={() => disconnect()}>
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
