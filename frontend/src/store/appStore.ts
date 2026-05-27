import { create } from "zustand";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/web";

type FheStatus = "idle" | "initializing" | "ready" | "error";

interface AppStore {
  fhevmInst: FhevmInstance | null;
  fheStatus: FheStatus;
  fheError: string | null;
  txStatus: string;

  setFhevmInst: (inst: FhevmInstance | null) => void;
  setFheStatus: (s: FheStatus) => void;
  setFheError: (e: string | null) => void;
  setTxStatus: (s: string) => void;
  clearTxStatus: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  fhevmInst: null,
  fheStatus: "idle",
  fheError: null,
  txStatus: "",

  setFhevmInst: (inst) => set({ fhevmInst: inst, fheStatus: inst ? "ready" : "idle" }),
  setFheStatus: (fheStatus) => set({ fheStatus }),
  setFheError: (fheError) => set({ fheError, fheStatus: "error" }),
  setTxStatus: (txStatus) => set({ txStatus }),
  clearTxStatus: () => set({ txStatus: "" }),
}));
