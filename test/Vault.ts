import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("Vault", function () {
  async function deploySifaToken() {
    const [owner, otherAccount] = await hre.ethers.getSigners();
    const SifaToken = await hre.ethers.getContractFactory("SifaToken");
    const sifa = await SifaToken.deploy(owner);

    return { sifa, owner, otherAccount };
  }

  async function deployVault() {
    const { sifa, owner, otherAccount } = await loadFixture(deploySifaToken);
    const Vault = await hre.ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(sifa);

    return { vault, sifa, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should have correct owner, token and initial supply", async function () {
      const { vault, sifa } = await loadFixture(deployVault);

      expect(await vault.token()).to.equal(sifa);
      expect(await vault.totalSupply()).to.equal(0);
    });
  });

  describe("Deposits", () => {
    it("Should revert deposit insufficient allowance", async () => {
      const { vault, sifa, owner, otherAccount } = await loadFixture(
        deployVault
      );
      await sifa.approve(vault, 100);
      await expect(vault.deposit(1000)).to.be.revertedWithCustomError(
        sifa,
        "ERC20InsufficientAllowance"
      );
    });

    it("Should revert deposit insufficient balance", async () => {
      const { vault, sifa, otherAccount } = await loadFixture(deployVault);
      await sifa.transfer(otherAccount, 100);
      await sifa.connect(otherAccount).approve(vault, 1000);
      await expect(
        vault.connect(otherAccount).deposit(1000)
      ).to.be.revertedWithCustomError(sifa, "ERC20InsufficientBalance");
    });

    it("Should deposit", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      await sifa.approve(vault, 1000);
      await expect(vault.deposit(1000)).to.emit(sifa, "Transfer");
      expect(await sifa.balanceOf(owner)).to.equal(
        999999999999999999999999000n
      );
      expect(await vault.totalSupply()).to.equal(1000);
    });

    it("Should not withdraw more than you have", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      await sifa.approve(vault, 1000);
      await expect(vault.deposit(1000)).to.emit(sifa, "Transfer");
      expect(await sifa.balanceOf(owner)).to.equal(
        999999999999999999999999000n
      );
      await expect(vault.withdraw(2000)).to.be.revertedWithPanic();
    });

    it("Should withdraw", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      await sifa.approve(vault, 1000);
      await expect(vault.deposit(1000)).to.emit(sifa, "Transfer");
      expect(await sifa.balanceOf(owner)).to.equal(
        999999999999999999999999000n
      );
      await expect(vault.withdraw(1000)).to.emit(sifa, "Transfer");
      expect(await vault.totalSupply()).to.equal(0);
    });
  });

  describe("Rewards", () => {
    it("Should take rewards", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      await sifa.approve(vault, 1000);
      await expect(vault.deposit(1000)).to.emit(sifa, "Transfer");
      await sifa.transfer(vault, 1000);
      await vault.withdraw(1000);
      expect(await sifa.balanceOf(vault)).to.equal(0);
      expect(await sifa.balanceOf(owner)).to.equal(
        1000000000000000000000000000n
      );
    });

    it("Should distribute rewards", async () => {
      const { vault, sifa, owner, otherAccount } = await loadFixture(
        deployVault
      );
      await sifa.approve(vault, 1000);
      await sifa.transfer(otherAccount, 1000);
      await sifa.connect(otherAccount).approve(vault, 1000);
      // deposit first.
      await vault.deposit(1000);
      // deposit again.
      await vault.connect(otherAccount).deposit(1000);
      // add rewards.
      await sifa.transfer(vault, 1000);

      await vault.withdraw(1000);
      await vault.connect(otherAccount).withdraw(1000);

      expect(await sifa.balanceOf(vault)).to.equal(0);
      expect(await sifa.balanceOf(owner)).to.equal(
        999999999999999999999998500n
      );
      expect(await sifa.balanceOf(otherAccount)).to.equal(1500n);
    });
  });
});
