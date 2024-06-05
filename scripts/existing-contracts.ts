import { network } from "hardhat";

import existingLocalContracts from "../.contracts-localhost.json";
import existingTestnetContracts from "../.contracts-testnet.json";
import existingMainnetContracts from "../.contracts-mainnet.json";

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
