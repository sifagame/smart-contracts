require("dotenv").config();
import { ethers, ignition } from "hardhat";

import config from "../ignition/genesis.testnet.json";
import SifaTokenModule from "../ignition/modules/SifaToken";
import FaucetModule from "../ignition/modules/Faucet";
import VaultModule from "../ignition/modules/Vault";
import EmitterModule from "../ignition/modules/Emitter";
import VestingVaultModule from "../ignition/modules/VestingVault";

async function main() {
  // Deploy the main SIFA Token
  const [sifaOwner] = await ethers.getSigners();
  const { sifaToken } = await ignition.deploy(SifaTokenModule, {
    parameters: { SifaToken: { owner: await sifaOwner.getAddress() } },
  });

  // Renounce ownership.
  await sifaToken.renounceOwnership();

  const token = await sifaToken.getAddress();

  console.log(`SIFA: ${token}`);

  // Faucet is not for mainnet.
  if ("mainnet" !== process.env.SIFA_ENV) {
    const dropAmount = ethers.parseEther(config.Faucet.dropAmount.toString());
    const delay = config.Faucet.delay;

    const { faucet } = await ignition.deploy(FaucetModule, {
      parameters: {
        Faucet: { token: await sifaToken.getAddress(), dropAmount, delay },
      },
    });

    console.log(`Faucet: ${await faucet.getAddress()}`);
  }

  // Deploy vault.
  const { vault } = await ignition.deploy(VaultModule, {
    parameters: { Vault: { token: await sifaToken.getAddress() } },
  });

  const vaultAddress = await vault.getAddress();

  console.log(`Vault: ${vaultAddress}`);

  // Deploy emitter.
  const [emitterOwner] = await ethers.getSigners();
  const { emitter } = await ignition.deploy(EmitterModule, {
    parameters: {
      Emitter: {
        token,
        vault: vaultAddress,
        owner: await emitterOwner.getAddress(),
      },
    },
  });
  const emitterAddress = await emitter.getAddress();

  console.log(`Emitter: ${emitterAddress}`);

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
      VestingVault: { owner: await vestingOwner.getAddress(), token },
    },
  });
  const vestingAddress = await vestingVault.getAddress();
  console.log(`Vesting: ${vestingAddress}`);

  await vestingVault.setup(config.Vesting.start, config.Vesting.duration);
  await vestingVault.renounceOwnership();

  // Calculate total vesting to approve.
  const vestingAmount = config.Vesting.vest.reduce(
    (p, v) => p + ethers.parseEther(v.amount.toString()),
    0n
  );
  await sifaToken.approve(vestingAddress, vestingAmount);

  // Vest everyone.
  config.Vesting.vest.forEach(async (vest) => {
    const amount = ethers.parseEther(vest.amount.toString());
    await vestingVault.vest(vest.address, amount);
    console.log(`Vested ${amount} to ${vest.address}`);
  });
}

main().catch(console.log);
