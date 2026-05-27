import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWalletButton() {
  return (
    <ConnectButton
      chainStatus="icon"
      showBalance={false}
      accountStatus="address"
    />
  );
}
