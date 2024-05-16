import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deployVault } from "./helpers";
import { ethers } from "hardhat";

describe("Vault", function () {
  describe("Deployment", function () {
    it("Should have correct asset and initial supply", async function () {
      const { vault, sifa } = await loadFixture(deployVault);

      expect(await vault.asset()).to.equal(sifa);
      expect(await vault.totalSupply()).to.equal(0);
    });
  });

  describe("Mint", () => {
    it("Should not allow mint", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const amount = ethers.parseEther("1000");
      await expect(vault.mint(amount, owner)).to.be.revertedWithCustomError(
        vault,
        "ERC4626ExceededMaxMint"
      );
    });
  });

  describe("Deposits", () => {
    it("Should deposit", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const amount = ethers.parseEther("1000");
      await sifa.approve(vault, amount);
      await expect(vault.deposit(amount, owner))
        .to.emit(vault, "Deposit")
        .withArgs(owner, owner, amount, amount);
      expect(await sifa.balanceOf(owner)).to.equal(
        999999000000000000000000000n
      );
      expect(await vault.totalSupply()).to.equal(amount);
    });

    it("Should withdraw", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const amount = ethers.parseEther("1000");
      await sifa.approve(vault, amount);
      await expect(vault.deposit(amount, owner)).to.emit(vault, "Deposit");
      expect(await sifa.balanceOf(owner)).to.equal(
        999999000000000000000000000n
      );
      await expect(vault.withdraw(amount, owner, owner)).to.emit(
        vault,
        "Withdraw"
      );
      expect(await vault.totalSupply()).to.equal(0);
    });
  });
});
