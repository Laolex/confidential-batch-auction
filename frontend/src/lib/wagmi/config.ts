import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Confidential Batch Clearing",
  projectId: "confidential-batch-auction",
  chains: [sepolia],
  ssr: false,
});
