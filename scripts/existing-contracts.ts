import { network } from "hardhat";
import { readFileSync } from "fs";

function readJsonFile(path: string) {
  try {
    const file = readFileSync(path, "utf8");
    return JSON.parse(file);
  } catch {
    return {};
  }
}

const existingLocalContracts = readJsonFile("../.contracts-localhost.json");
const existingTestnetContracts = readJsonFile("../.contracts-testnet.json");
const existingMainnetContracts = readJsonFile("../.contracts-mainnet.json");

type ExistingContracts = {
  SIFA?: string;
  Faucet?: string;
  Vault?: string;
  Emitter?: string;
  Vesting?: string;
};

const existingContracts: ExistingContracts =
  network.name === "mainnet"
    ? existingMainnetContracts
    : network.name === "testnet"
    ? existingTestnetContracts
    : network.name === "localhost"
    ? existingLocalContracts
    : {};

export default existingContracts;
