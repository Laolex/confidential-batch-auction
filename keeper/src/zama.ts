import {
  createInstance,
  SepoliaConfig,
  type FhevmInstanceConfig,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/node";

let _inst: FhevmInstance | null = null;

async function getInstance(): Promise<FhevmInstance> {
  if (!_inst) {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL not set");

    const config: FhevmInstanceConfig = {
      ...SepoliaConfig,
      network: rpcUrl,   // string RPC URL works for server-side (no browser wallet needed)
    };
    _inst = await createInstance(config);
  }
  return _inst;
}

export async function publicDecrypt(handles: string[]): Promise<{
  abiEncodedClearValues: string;
  decryptionProof: string;
}> {
  const inst = await getInstance();
  const result = await inst.publicDecrypt(handles);
  return {
    abiEncodedClearValues: result.abiEncodedClearValues,
    decryptionProof: result.decryptionProof,
  };
}
