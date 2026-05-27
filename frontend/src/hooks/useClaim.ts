import { useState } from "react";
import { useWriteContract, useAccount } from "wagmi";
import { useAppStore } from "@/store/appStore";
import { useEncPayout } from "@/hooks/useMarkets";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contracts/config";

export function useClaim(marketId: number) {
  const { address } = useAccount();
  const { fhevmInst, setTxStatus } = useAppStore();
  const { writeContractAsync } = useWriteContract();
  const { refetch: refetchPayout } = useEncPayout(marketId, address);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim(alreadyRequested: boolean) {
    if (!fhevmInst) throw new Error("FHE relayer not initialized");
    if (!address) throw new Error("Wallet not connected");

    setIsPending(true);
    setError(null);
    try {
      if (!alreadyRequested) {
        setTxStatus("Requesting encrypted payout computation…");
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "requestPayout",
          args: [BigInt(marketId)],
        });
      }

      const { data: freshPayout } = await refetchPayout();
      const handle = freshPayout as string | undefined;
      if (!handle) throw new Error("Payout handle not available");

      setTxStatus("Requesting KMS signature for payout…");
      const result = await fhevmInst.publicDecrypt([handle]);

      setTxStatus("Submitting payout proof…");
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "onPayoutRevealed",
        args: [
          BigInt(marketId),
          address,
          [handle] as [`0x${string}`],
          result.abiEncodedClearValues as `0x${string}`,
          result.decryptionProof as `0x${string}`,
        ],
      });

      setTxStatus(`Settlement complete: ${hash.slice(0, 10)}…`);
      return hash;
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string; message?: string })?.shortMessage
        ?? (e as { message?: string })?.message
        ?? String(e);
      setError(msg);
      setTxStatus("Error: " + msg);
      throw e;
    } finally {
      setIsPending(false);
    }
  }

  return { claim, isPending, error };
}
