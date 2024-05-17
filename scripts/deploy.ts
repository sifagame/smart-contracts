require("dotenv").config();
import { ethers, ignition, run } from "hardhat";
import "@nomicfoundation/hardhat-verify";

import config from "../ignition/loadConfig";
import SifaTokenModule from "../ignition/modules/SifaToken";
import FaucetModule from "../ignition/modules/Faucet";
import VaultModule from "../ignition/modules/Vault";
import EmitterModule from "../ignition/modules/Emitter";
import VestingVaultModule from "../ignition/modules/VestingVault";

const shouldVerify = () =>
  ["testnet", "mainnet"].includes(process.env.ENV || "");

async function main() {
  // Deploy the main SIFA Token
  const [sifaOwner] = await ethers.getSigners();
  const { sifaToken } = await ignition.deploy(SifaTokenModule, {
    parameters: { SifaToken: { owner: await sifaOwner.getAddress() } },
  });

  // Renounce ownership.
  await sifaToken.renounceOwnership();

  const tokenAddress = await sifaToken.getAddress();

  console.log(`SIFA: ${tokenAddress}`);
  if (shouldVerify()) {
    await run("verify:verify", {
      address: tokenAddress,
      constructorArguments: [await sifaOwner.getAddress()],
    })
      .then(console.log)
      .catch(console.log);
  }

  // Faucet is not for mainnet.
  if ("mainnet" !== process.env.ENV) {
    const dropAmount = ethers.parseEther(config.Faucet.dropAmount.toString());
    const delay = config.Faucet.delay;

    const { faucet } = await ignition.deploy(FaucetModule, {
      parameters: {
        Faucet: { token: await sifaToken.getAddress(), dropAmount, delay },
      },
    });

    console.log(`Faucet: ${await faucet.getAddress()}`);
    if (shouldVerify()) {
      await run("verify:verify", {
        address: await faucet.getAddress(),
        constructorArguments: [await sifaOwner.getAddress(), dropAmount, delay],
      })
        .then(console.log)
        .catch(console.log);
    }
  }

  // Deploy vault.
  const { vault } = await ignition.deploy(VaultModule, {
    parameters: { Vault: { token: tokenAddress } },
  });

  const vaultAddress = await vault.getAddress();

  // Deposit to dead address, protect from inflation attack.
  sifaToken.approve(vaultAddress, ethers.parseEther("1"));
  vault.deposit(
    ethers.parseEther("1"),
    "0x000000000000000000000000000000000000dEaD"
  );

  console.log(`Vault: ${await vault.getAddress()}`);
  if (shouldVerify()) {
    await run("verify:verify", {
      address: vaultAddress,
      constructorArguments: [tokenAddress],
    })
      .then(console.log)
      .catch(console.log);
  }

  // Deploy emitter.
  const [emitterOwner] = await ethers.getSigners();
  const { emitter } = await ignition.deploy(EmitterModule, {
    parameters: {
      Emitter: {
        owner: await emitterOwner.getAddress(),
        token: tokenAddress,
        vault: vaultAddress,
      },
    },
  });
  const emitterAddress = await emitter.getAddress();

  console.log(`Emitter: ${await emitter.getAddress()}`);
  if (shouldVerify()) {
    await run("verify:verify", {
      address: await emitter.getAddress(),
      constructorArguments: [
        tokenAddress,
        vaultAddress,
        await emitterOwner.getAddress(),
      ],
    })
      .then(console.log)
      .catch(console.log);
  }

  // Fill emitter.
  const emitterAmount = config.Emitter.amount.toString();
  await sifaToken.approve(emitterAddress, ethers.parseEther(emitterAmount));
  await emitter.fill(ethers.parseEther(emitterAmount));
  await emitter.start();
  // No ownership after start.
  await emitter.renounceOwnership();

  // Deploy Vesting Vault.
  const [vestingOwner] = await ethers.getSigners();
  const { vestingVault } = await ignition.deploy(VestingVaultModule, {
    parameters: {
      VestingVault: {
        owner: await vestingOwner.getAddress(),
        token: tokenAddress,
      },
    },
  });
  const vestingAddress = await vestingVault.getAddress();
  console.log(`Vesting: ${vestingAddress}`);
  if (shouldVerify()) {
    await run("verify:verify", {
      address: vestingAddress,
      constructorArguments: [await vestingOwner.getAddress(), tokenAddress],
    })
      .then(console.log)
      .catch(console.log);
  }

  await vestingVault.setup(config.Vesting.start, config.Vesting.duration);
  await vestingVault.renounceOwnership();

  // Calculate total vesting to approve.
  const vestingAmount = config.Vesting.vest.reduce(
    (p, v) => p + ethers.parseEther(v.amount.toString()),
    0n
  );
  await sifaToken.approve(vestingAddress, vestingAmount);

  // Vest everyone.
  for (let i = 0; i < config.Vesting.vest.length; i++) {
    const vest = config.Vesting.vest[i];
    const amount = ethers.parseEther(vest.amount.toString());
    await vestingVault.vest(vest.address, amount);
    console.log(`Vested ${amount} to ${vest.address}`);
  }
}

main().catch(console.log);
