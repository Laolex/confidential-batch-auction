import { useEffect } from "react";
import { useAccount } from "wagmi";
import { initFheInstance } from "@/lib/fhe/encrypt";
import { useAppStore } from "@/store/appStore";

export function useFhe() {
  const { address, isConnected } = useAccount();
  const { fhevmInst, fheStatus, fheError, setFhevmInst, setFheStatus, setFheError } =
    useAppStore();

  useEffect(() => {
    if (!isConnected || !address || fhevmInst || fheStatus === "initializing") return;

    setFheStatus("initializing");
    initFheInstance(address)
      .then((inst) => setFhevmInst(inst))
      .catch((err) => setFheError(String(err?.message ?? err)));
  }, [isConnected, address]);

  return { fhevmInst, fheStatus, fheError, isReady: fheStatus === "ready" };
}
