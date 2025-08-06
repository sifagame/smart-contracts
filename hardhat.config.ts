require("dotenv").config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    testnet: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: [process.env.TESTNET_DEPLOYER_PRIMARY_KEY || ""],
    },
    mainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: [process.env.MAINNET_DEPLOYER_PRIMARY_KEY || ""],
    },
  },
  etherscan: {
    apiKey: process.env.ARBISCAN_API_KEY,
  },
  ignition: {
    requiredConfirmations: 5,
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    gasPrice: 21,
    showMethodSig: true,
    showTimeSpent: true,
  },
};

export default config;
