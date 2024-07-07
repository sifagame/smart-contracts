import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, { ethers } from "hardhat";

export const initializeEmitterVaultConnection = async (
  amount: number | string,
  lockToVault: number | string = 0
) => {
  const { emitter, vault, sifa, owner } = await loadFixture(deployEmitter);
  await vault.updateEmitter(emitter);
  const tokens = ethers.parseEther(amount.toString());
  const max = await vault.maxDeposit(owner);
  await sifa.approve(vault, max);
  await sifa.transfer(emitter, tokens);
  await emitter.start();

  if (lockToVault) {
    const vaultAmount = ethers.parseEther(lockToVault.toString());
    await vault.deposit(vaultAmount, owner);
  }

  return { emitter, vault, sifa, owner };
};

export async function deploySifaToken() {
  const [owner, otherAccount] = await hre.ethers.getSigners();
  const SifaToken = await hre.ethers.getContractFactory("SifaToken");
  const sifa = await SifaToken.deploy(owner);

  return { sifa, owner, otherAccount };
}

export async function deployVault() {
  const { sifa, owner, otherAccount } = await loadFixture(deploySifaToken);
  const Vault = await hre.ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(sifa, owner);

  return { vault, sifa, owner, otherAccount };
}

export async function deployVestingVault() {
  const { sifa, owner, otherAccount } = await loadFixture(deploySifaToken);
  const VestingVault = await hre.ethers.getContractFactory("VestingVault");
  const vestingVault = await VestingVault.deploy(sifa);

  return { vestingVault, sifa, owner, otherAccount };
}

export async function deployEmitter() {
  const { vault, sifa, owner, otherAccount } = await loadFixture(deployVault);
  const Emitter = await hre.ethers.getContractFactory("Emitter");
  const emitter = await Emitter.deploy(owner, sifa, vault);

  return { emitter, vault, sifa, owner, otherAccount };
}

export async function deployFaucet() {
  const { sifa, owner, otherAccount } = await loadFixture(deploySifaToken);
  const Faucet = await hre.ethers.getContractFactory("Faucet");
  const faucet = await Faucet.deploy(
    sifa,
    ethers.parseEther("420"),
    60 * 60 * 24
  );

  return { faucet, sifa, owner, otherAccount };
}
