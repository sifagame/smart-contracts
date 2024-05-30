import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import {
  deployEmitter,
  deployVault,
  initializeEmitterVaultConnection,
} from "./helpers";
import { ethers } from "hardhat";

describe("Vault", function () {
  describe("Deployment", function () {
    it("Should have correct asset and initial supply", async function () {
      const { vault, sifa, owner } = await loadFixture(deployVault);

      expect(await vault.name()).equals("Sifa Vault");
      expect(await vault.symbol()).equals("vSIFA");
      expect(await vault.owner()).equals(owner);
      expect(await vault.asset()).to.equal(sifa);
      expect(await vault.totalSupply()).to.equal(0);
      expect(await vault.decimals()).equals(18);
    });
  });

  describe("Connect with emitter", () => {
    it("Should skip emitter if not set", async () => {
      const { emitter, vault, sifa, owner } = await loadFixture(deployEmitter);
      await sifa.approve(vault, ethers.parseEther("1000"));
      await vault.deposit(ethers.parseEther("1000"), owner);
      await sifa.transfer(vault, ethers.parseEther("1000"));
      const maxWithdraw = await vault.maxWithdraw(owner);
      await expect(vault.withdraw(maxWithdraw / 2n, owner, owner)).to.not.emit(
        emitter,
        "Withdrawn"
      );
      const maxRedeem = await vault.maxRedeem(owner);
      await expect(vault.redeem(maxRedeem, owner, owner)).to.not.emit(
        emitter,
        "Withdrawn"
      );
    });

    it("Should update emitter", async () => {
      const { emitter, vault } = await loadFixture(deployEmitter);
      await vault.updateEmitter(emitter);
      expect(await vault.emitter()).equals(emitter);
    });

    it("Should withdraw emitter", async () => {
      const { emitter, vault, sifa } = await initializeEmitterVaultConnection(
        800000000
      );
      const [owner, otherAccount] = await ethers.getSigners();
      const assets = ethers.parseEther("1");
      const assetsBefore = await sifa.balanceOf(owner);

      await time.increase(10);

      await expect(emitter.withdraw()).to.emit(emitter, "VaultIsEmpty");

      await vault.deposit(assets, owner);
      await vault.deposit(assets, otherAccount);

      const maxRedeem = await vault.maxRedeem(owner);
      await expect(vault.redeem(maxRedeem, owner, owner)).to.emit(
        emitter,
        "Withdrawn"
      );

      await vault.deposit(assets, owner);

      const maxWithdraw = await vault.maxWithdraw(owner);
      await expect(vault.withdraw(maxWithdraw, owner, owner)).to.emit(
        emitter,
        "Withdrawn"
      );

      const assetsAfter = await sifa.balanceOf(owner);

      expect(assetsBefore).lessThan(assetsAfter);
    });

    it("Should empty account if withdraw 100%", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(800000000);
      const assets = ethers.parseEther("1");
      const assetsBefore = await sifa.balanceOf(owner);
      await vault.deposit(assets, owner);

      await time.increase(100);
      await emitter.withdraw();

      const maxWithdraw = await vault.maxWithdraw(owner);
      const maxRedeem = await vault.maxRedeem(owner);
      await time.increase(10);

      await expect(vault.withdraw(maxWithdraw, owner, owner))
        .to.emit(vault, "Withdraw")
        .withArgs(owner, owner, owner, maxWithdraw, maxRedeem);
      expect(await vault.maxRedeem(owner)).equals(0);
      expect(await vault.maxWithdraw(owner)).equals(0);
    });

    it("Should withdraw and redeem after emission ends", async () => {
      const { emitter, vault, sifa } = await initializeEmitterVaultConnection(
        800000000,
        1
      );
      const epochLength = await emitter.epochLength();
      const [owner, otherAccount] = await ethers.getSigners();

      const otherAsssets = ethers.parseEther("4.2");

      await emitter.withdraw();

      await time.increase(epochLength * 100n);
      await vault.deposit(otherAsssets, otherAccount);

      await time.increase(epochLength * 50n);

      const ownerShares = await vault.balanceOf(owner);
      const otherShares = await vault.balanceOf(otherAccount);

      await vault.redeem(ownerShares, owner, owner);
      await vault
        .connect(otherAccount)
        .redeem(otherShares, otherAccount, otherAccount);

      await vault.deposit(otherAsssets, owner);
      await vault.deposit(otherAsssets, otherAccount);

      await sifa.transfer(vault, otherAsssets);

      await expect(vault.redeem(30000000n, owner, owner)).to.emit(
        vault,
        "Withdraw"
      );

      await expect(vault.withdraw(30000000n, owner, owner)).to.emit(
        vault,
        "Withdraw"
      );
    });
  });
});
