import {
  initSDK,
  createInstance,
  SepoliaConfig,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/web";
import { bytesToHex } from "viem";

export async function initFheInstance(
  userAddress: string
): Promise<FhevmInstance> {
  const eth = (window as Window & { ethereum?: unknown }).ethereum;
  if (!eth) throw new Error("No Ethereum provider found");

  await initSDK();

  const relayerUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/zama-relay`
      : undefined;

  try {
    const inst = (await Promise.race([
      createInstance({ ...SepoliaConfig, network: eth, ...(relayerUrl ? { relayerUrl } : {}) }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("FHE init timeout")), 60_000)
      ),
    ])) as FhevmInstance;
    return inst;
  } catch {
    // Fallback without relayer
    return createInstance({ ...SepoliaConfig, network: eth }) as Promise<FhevmInstance>;
  }
}

export async function encryptSide(
  fhevmInst: FhevmInstance,
  contractAddress: string,
  userAddress: string,
  side: number
): Promise<{ handle: `0x${string}`; inputProof: `0x${string}` }> {
  const buf = fhevmInst.createEncryptedInput(contractAddress, userAddress);
  buf.add8(BigInt(side));
  const enc = await buf.encrypt();

  // SDK v0.4 returns Uint8Array for both handles and inputProof.
  // viem's ABI encoder calls .replace() internally on bytes/bytes32 args,
  // so we must pass 0x-prefixed hex strings — never raw Uint8Arrays.
  const toHex = (v: unknown): `0x${string}` => {
    if (typeof v === "string") return v.startsWith("0x") ? (v as `0x${string}`) : `0x${v}`;
    if (v instanceof Uint8Array) return bytesToHex(v);
    throw new Error(`encryptSide: unexpected type ${typeof v}`);
  };

  return {
    handle:     toHex(enc.handles[0]),
    inputProof: toHex(enc.inputProof),
  };
}
