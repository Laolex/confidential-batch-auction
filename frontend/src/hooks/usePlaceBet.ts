import { useState } from "react";
import { parseEther } from "viem";
import { useWriteContract, useAccount } from "wagmi";
import { encryptSide } from "@/lib/fhe/encrypt";
import { useAppStore } from "@/store/appStore";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contracts/config";

export function usePlaceBet() {
  const { address } = useAccount();
  const { fhevmInst, setTxStatus } = useAppStore();
  const { writeContractAsync } = useWriteContract();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function placeBet(marketId: number, side: number, amountEth: string) {
    if (!fhevmInst) throw new Error("FHE relayer not initialized");
    if (!address) throw new Error("Wallet not connected");

    setIsPending(true);
    setError(null);
    try {
      setTxStatus("Encrypting directional input…");
      const { handle, inputProof } = await encryptSide(fhevmInst, CONTRACT_ADDRESS, address, side);

      setTxStatus("Submitting sealed bid…");
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "placeBet",
        args: [BigInt(marketId), handle, inputProof],
        value: parseEther(amountEth),
      });

      setTxStatus(`Confirmed: ${hash.slice(0, 10)}…`);
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

  return { placeBet, isPending, error };
}
