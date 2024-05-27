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

  describe("Redeem Request", () => {
    it("Should request redeem", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      await vault.deposit(assets, owner);

      const shares = await vault.balanceOf(owner);
      await vault.requestRedeem(shares, owner);
      const request = await vault.redeemRequests(owner);
      const now = await time.latest();
      const twoWeeks = now + 2 * 7 * 24 * 60 * 60;
      expect(request[0]).equals(twoWeeks);
      expect(request[1]).equals(shares);
    });

    it("Should revert if shares exceed", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      await vault.deposit(assets, owner);

      const shares = ethers.parseEther("1.01");
      await expect(vault.requestRedeem(shares, owner)).to.be.revertedWith(
        "Exceeds max redeem"
      );
    });

    it("Request with allowance", async () => {
      const { vault, sifa } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      const [owner, otherAccount] = await ethers.getSigners();

      await vault.deposit(assets, otherAccount);

      const shares = await vault.balanceOf(otherAccount);
      await expect(
        vault.requestRedeem(shares, otherAccount)
      ).to.be.revertedWith("Not enough allowance");

      await vault.connect(otherAccount).approve(owner, shares);
      const now = await time.latest();
      const twoWeeks = now + 2 * 7 * 24 * 60 * 60 + 1;

      await expect(vault.requestRedeem(shares, otherAccount))
        .to.emit(vault, "RedeemRequested")
        .withArgs(shares, otherAccount, twoWeeks);
    });
  });

  describe("Withdraw", () => {
    it("Withdraw disabled", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      await vault.deposit(assets, owner);
      await expect(vault.withdraw(assets, owner, owner)).to.be.revertedWith(
        "Use redeem()"
      );
    });
  });

  describe("Redeem", () => {
    it("Should revert before time", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      await vault.deposit(assets, owner);
      await vault.requestRedeem(assets, owner);
      const [availableAt, shares] = await vault.redeemRequests(owner);
      await time.increaseTo(availableAt - 5n);

      await expect(vault.redeem(shares, owner, owner)).to.be.revertedWith(
        "Redeem not available yet"
      );
    });

    it("Should revert amount exceeds", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      await vault.deposit(assets, owner);
      await vault.requestRedeem(assets, owner);
      const [availableAt, shares] = await vault.redeemRequests(owner);
      await time.increaseTo(availableAt + 10n);
      await expect(
        vault.redeem(shares + 100n, owner, owner)
      ).to.be.revertedWith("Redeem amount exceed available");
    });

    it("Should redeem", async () => {
      const { vault, sifa, owner } = await loadFixture(deployVault);
      const assets = ethers.parseEther("1");
      await sifa.approve(vault, assets);
      await vault.deposit(assets, owner);
      await vault.requestRedeem(assets, owner);
      const [availableAt, shares] = await vault.redeemRequests(owner);
      await time.increaseTo(availableAt + 10n);
      await expect(vault.redeem(shares, owner, owner))
        .to.emit(vault, "Withdraw")
        .withArgs(owner, owner, owner, assets, shares);
    });
  });

  describe("Connect with emitter", () => {
    it("Should skip emitter if not set", async () => {
      const { emitter, vault, sifa, owner } = await loadFixture(deployEmitter);
      await sifa.approve(vault, ethers.parseEther("1000"));
      await vault.deposit(ethers.parseEther("1000"), owner);
      await vault.requestRedeem(ethers.parseEther("1000"), owner);
      const [availableAt, shares] = await vault.redeemRequests(owner);
      await time.increaseTo(availableAt + 10n);

      await sifa.transfer(vault, ethers.parseEther("1000"));
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
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(800000000);
      const assets = ethers.parseEther("1");
      const assetsBefore = await sifa.balanceOf(owner);

      await time.increase(10);

      await expect(emitter.withdraw()).to.emit(emitter, "VaultIsEmpty");

      await vault.deposit(assets, owner);

      const maxRedeem = await vault.maxRedeem(owner);
      await vault.requestRedeem(maxRedeem, owner);
      const [availableAt, shares] = await vault.redeemRequests(owner);
      await time.increaseTo(availableAt + 10n);

      await expect(vault.redeem(shares, owner, owner)).to.emit(
        emitter,
        "Withdrawn"
      );

      await vault.deposit(assets, owner);

      const assetsAfter = await sifa.balanceOf(owner);

      expect(assetsBefore).lessThan(assetsAfter);
    });

    it("Should withdraw and redeem after emission ends", async () => {
      const { emitter, vault, sifa } = await initializeEmitterVaultConnection(
        800000000,
        1
      );
      const epochLength = await emitter.epochLength();
      const [owner, otherAccount] = await ethers.getSigners();

      const otherAsets = ethers.parseEther("4.2");

      await emitter.withdraw();

      await time.increase(epochLength * 100n);
      await vault.deposit(otherAsets, otherAccount);
      const ownerShares = await vault.balanceOf(owner);
      const otherShares = await vault.balanceOf(otherAccount);

      await vault.requestRedeem(ownerShares, owner);
      await vault
        .connect(otherAccount)
        .requestRedeem(otherShares, otherAccount);

      await time.increase(epochLength * 50n);

      await vault.redeem(ownerShares, owner, owner);
      await vault
        .connect(otherAccount)
        .redeem(otherShares, otherAccount, otherAccount);

      await vault.deposit(otherAsets, owner);

      await sifa.transfer(vault, otherAsets);
      const maxRedeem = await vault.maxRedeem(owner);
      await vault.requestRedeem(maxRedeem, owner);
      const [availableAt, shares] = await vault.redeemRequests(owner);
      await time.increaseTo(availableAt + 10n);

      await expect(vault.redeem(30000000n, owner, owner)).to.emit(
        vault,
        "Withdraw"
      );
    });
  });
});
