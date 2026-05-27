import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const STATE_FILE = join(process.cwd(), ".keeper-state.json");

interface State {
  lastBlock: number;
  oracleMarketIds: number[];
}

export function loadState(): State {
  if (!existsSync(STATE_FILE)) return { lastBlock: 0, oracleMarketIds: [] };
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as Partial<State>;
    return { lastBlock: s.lastBlock ?? 0, oracleMarketIds: s.oracleMarketIds ?? [] };
  } catch {
    return { lastBlock: 0, oracleMarketIds: [] };
  }
}

export function saveState(s: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
