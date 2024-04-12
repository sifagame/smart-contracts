import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";

export async function deploySifaToken() {
  const [owner, otherAccount] = await hre.ethers.getSigners();
  const SifaToken = await hre.ethers.getContractFactory("SifaToken");
  const sifa = await SifaToken.deploy(owner);

  return { sifa, owner, otherAccount };
}

export async function deployVault() {
  const { sifa, owner, otherAccount } = await loadFixture(deploySifaToken);
  const Vault = await hre.ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(sifa);

  return { vault, sifa, owner, otherAccount };
}

export async function deployRewardsLock() {
  const { vault, sifa, owner, otherAccount } = await loadFixture(deployVault);
  const RewardsLock = await hre.ethers.getContractFactory("RewardsLock");
  const lock = await RewardsLock.deploy(sifa, vault);

  return { lock, vault, sifa, owner, otherAccount };
}
