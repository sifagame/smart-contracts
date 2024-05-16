require("dotenv").config();

import mainnetConfig from "../ignition/genesis.json";
import testnetConfig from "../ignition/genesis.testnet.json";

const config = process.env.ENV === "mainnet" ? mainnetConfig : testnetConfig;

export default config;
