require("dotenv").config();
import { ethers, ignition, run, network } from "hardhat";
import "@nomicfoundation/hardhat-verify";
import fs from "node:fs";

import config from "../ignition/loadConfig";
import existingContracts from "./existing-contracts";

import SifaTokenModule from "../ignition/modules/SifaToken";
import FaucetModule from "../ignition/modules/Faucet";
import VaultModule from "../ignition/modules/Vault";
import EmitterModule from "../ignition/modules/Emitter";
import VestingVaultModule from "../ignition/modules/VestingVault";

const logFile = `.contracts-${network.name}`;
const contractsFile = logFile + ".json";

const shouldVerify = () => ["testnet", "mainnet"].includes(network.name);
const logContract = (s: string, flag: string = "a") => {
  console.log(s);
  fs.writeFileSync(logFile, s + "\n", { flag });
};

const updateContractsJson = () => {
  console.log("Updating contracts JSON");
  const contracts: { [index: string]: string } = {};
  fs.readFile(logFile, (err, data) => {
    if (err) throw err;
    data
      .toString()
      .split("\n")
      .map((l) => {
        const [name, address] = l.split(": ");
        if (typeof name !== "undefined" && typeof address !== "undefined") {
          contracts[name] = address;
        }
      });
    fs.writeFileSync(contractsFile, JSON.stringify(contracts, null, 2));
  });
};

async function main() {
  const now = new Date();
  logContract(
    `===\n${
      network.name
    } contracts\n${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    "w"
  );

  let tokenAddress: string, sifaToken;

  if (!existingContracts.SIFA) {
    console.log("SIFA doesn't exist, creating new.");
    // Deploy the main SIFA Token
    const [sifaOwner] = await ethers.getSigners();
    const { sifaToken: newToken } = await ignition.deploy(SifaTokenModule, {
      parameters: { SifaToken: { owner: await sifaOwner.getAddress() } },
    });

    sifaToken = newToken;

    // Renounce ownership.
    await sifaToken.renounceOwnership();

    tokenAddress = await sifaToken.getAddress();

    if (shouldVerify()) {
      await run("verify:verify", {
        address: tokenAddress,
        constructorArguments: [await sifaOwner.getAddress()],
      })
        .then(console.log)
        .catch(console.log);
    }
  } else {
    tokenAddress = existingContracts.SIFA;
    console.log(`SIFA exist, using ${tokenAddress}`);
    const sifaTokenFactory = await ethers.getContractFactory("SifaToken");
    sifaToken = sifaTokenFactory.attach(tokenAddress);
  }

  logContract(`SIFA: ${tokenAddress}`);

  let faucetAddress: string, faucet;

  // Faucet is not for mainnet.
  if ("mainnet" !== process.env.ENV && config.Faucet.totalSupply > 0) {
    if (!existingContracts.Faucet) {
      const dropAmount = ethers.parseEther(config.Faucet.dropAmount.toString());
      const delay = config.Faucet.delay;

      const { faucet: newFaucet } = await ignition.deploy(FaucetModule, {
        parameters: {
          Faucet: { token: tokenAddress, dropAmount, delay },
        },
      });

      faucet = newFaucet;
      faucetAddress = await faucet.getAddress();

      if (shouldVerify()) {
        await run("verify:verify", {
          address: faucetAddress,
          constructorArguments: [tokenAddress, dropAmount, delay],
        })
          .then(console.log)
          .catch(console.log);
      }

      // Feed the faucet.
      await sifaToken.transfer(
        faucetAddress,
        ethers.parseEther(config.Faucet.totalSupply.toString())
      );
    } else {
      faucetAddress = existingContracts.Faucet;
      console.log(`Faucet exist, using ${faucetAddress}`);
      const faucetFactory = await ethers.getContractFactory("Faucet");
      faucet = faucetFactory.attach(faucetAddress);
    }

    logContract(`Faucet: ${faucetAddress}`);
  }

  let vaultAddress: string, vault;

  if (!existingContracts.Vault) {
    // Deploy vault.
    const [vaultOwner] = await ethers.getSigners();
    const { vault: newVault } = await ignition.deploy(VaultModule, {
      parameters: {
        Vault: { token: tokenAddress, owner: await vaultOwner.getAddress() },
      },
    });
    vault = newVault;
    vaultAddress = await vault.getAddress();

    // Deposit to dead address, protect from inflation attack.
    await sifaToken.approve(vaultAddress, ethers.parseEther("1"));
    await vault.deposit(
      ethers.parseEther("1"),
      "0x000000000000000000000000000000000000dEaD"
    );

    if (shouldVerify()) {
      await run("verify:verify", {
        address: vaultAddress,
        constructorArguments: [tokenAddress, await vaultOwner.getAddress()],
      })
        .then(console.log)
        .catch(console.log);
    }
  } else {
    vaultAddress = existingContracts.Vault;
    console.log(`Vault exist, using ${vaultAddress}`);
    const vaultFactory = await ethers.getContractFactory("Vault");
    vault = vaultFactory.attach(vaultAddress);
  }
  logContract(`Vault: ${vaultAddress}`);

  let emitterAddress: string, emitter;
  if (!existingContracts.Emitter) {
    // Deploy emitter.
    const [emitterOwner] = await ethers.getSigners();
    const { emitter: newEmitter } = await ignition.deploy(EmitterModule, {
      parameters: {
        Emitter: {
          owner: await emitterOwner.getAddress(),
          token: tokenAddress,
          vault: vaultAddress,
        },
      },
    });
    emitter = newEmitter;
    emitterAddress = await emitter.getAddress();

    if (shouldVerify()) {
      await run("verify:verify", {
        address: await emitter.getAddress(),
        constructorArguments: [
          await emitterOwner.getAddress(),
          tokenAddress,
          vaultAddress,
        ],
      })
        .then(console.log)
        .catch(console.log);
    }

    // Fill emitter.
    const emitterAmount = config.Emitter.amount.toString();
    await sifaToken.transfer(emitterAddress, ethers.parseEther(emitterAmount));
  } else {
    emitterAddress = existingContracts.Emitter;
    console.log(`Emitter exist, using ${emitterAddress}`);
    const emitterFactory = await ethers.getContractFactory("Emitter");
    emitter = emitterFactory.attach(emitterAddress);
  }
  logContract(`Emitter: ${emitterAddress}`);

  // Link vault to emitter.
  await vault.updateEmitter(emitterAddress);

  let vestingAddress: string, vestingVault;
  if (!existingContracts.Vesting) {
    // Deploy Vesting Vault.
    const { vestingVault: newVesting } = await ignition.deploy(
      VestingVaultModule,
      {
        parameters: {
          VestingVault: {
            token: tokenAddress,
          },
        },
      }
    );
    vestingVault = newVesting;
    vestingAddress = await vestingVault.getAddress();
    if (shouldVerify()) {
      await run("verify:verify", {
        address: vestingAddress,
        constructorArguments: [tokenAddress],
      })
        .then(console.log)
        .catch(console.log);
    }

    // Calculate total vesting to approve.
    const vestingAmount = config.Vesting.vest.reduce(
      (p, v) => p + ethers.parseEther(v.amount.toString()),
      0n
    );
    if (vestingAmount > 0) {
      await sifaToken.approve(vestingAddress, vestingAmount);

      // Vest everyone.
      for (let i = 0; i < config.Vesting.vest.length; i++) {
        const vest = config.Vesting.vest[i];
        const amount = ethers.parseEther(vest.amount.toString());
        if (amount <= 0) {
          continue;
        }
        await vestingVault.vest(
          vest.address,
          amount,
          vest.start,
          vest.duration
        );
        console.log(
          `Vested ${amount} to ${vest.address}, cliff ${
            new Date(vest.start * 1000).toLocaleString().split(",")[0]
          } for ${vest.duration / 24 / 60 / 60} days`
        );
      }
    }
  } else {
    vestingAddress = existingContracts.Vesting;
    console.log(`Vesting vault exist, using ${vestingAddress}`);
    const vestingVaultFactory = await ethers.getContractFactory("VestingVault");
    vestingVault = vestingVaultFactory.attach(vestingAddress);
  }

  logContract(`Vesting: ${vestingAddress}`);

  updateContractsJson();
}

main();
