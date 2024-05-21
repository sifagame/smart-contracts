import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deployAll } from "./helpers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Vesting Vault", () => {
  describe("Deployment", () => {
    it("Should deploy", async () => {
      const { vestingVault, sifa } = await loadFixture(deployAll);
      expect(await vestingVault.token()).equals(sifa);
    });
  });

  describe("Vest", () => {
    it("Should vest", async () => {
      const { vestingVault, sifa, owner } = await loadFixture(deployAll);
      const start = (await time.latest()) + 100;
      const duration = 420;
      await sifa.approve(vestingVault, 100);

      await expect(vestingVault.vest(owner, 100, start, duration))
        .to.emit(vestingVault, "Vested")
        .withArgs(100, owner, start, duration);
    });

    it("Should ignore start adn duration after first vesting", async () => {
      const { vestingVault, sifa, owner } = await loadFixture(deployAll);
      const start = (await time.latest()) + 100;
      const duration = 420;
      await sifa.approve(vestingVault, 1000);

      await expect(vestingVault.vest(owner, 400, start, duration))
        .to.emit(vestingVault, "Vested")
        .withArgs(400, owner, start, duration);

      await expect(vestingVault.vest(owner, 600, start + 50, duration + 100))
        .to.emit(vestingVault, "Vested")
        .withArgs(600, owner, start, duration);

      expect(await vestingVault.start(owner)).equals(start);
      expect(await vestingVault.duration(owner)).equals(duration);
      expect(await vestingVault.end(owner)).equals(start + duration);
    });
  });

  describe("Schedules", () => {
    it("Should make 1 token per second available", async () => {
      const { vestingVault, sifa } = await loadFixture(deployAll);
      const [_, account1] = await ethers.getSigners();

      const amount = ethers.parseEther("1000");
      const start = (await time.latest()) + 100;
      const duration = 1000;
      await sifa.approve(vestingVault, amount);
      await vestingVault.vest(account1, amount, start, duration);

      await time.increaseTo(start);
      expect(await vestingVault.vested(account1)).equals(amount);
      expect(await vestingVault.released(account1)).equals(0);
      expect(await vestingVault.releasable(account1)).equals(0);

      await time.increase(10);
      expect(await vestingVault.vested(account1)).equals(amount);
      expect(await vestingVault.released(account1)).equals(0);
      expect(await vestingVault.releasable(account1)).equals(
        ethers.parseEther("10")
      );

      await time.increase(32);
      expect(await vestingVault.vested(account1)).equals(amount);
      expect(await vestingVault.released(account1)).equals(0);
      expect(await vestingVault.releasable(account1)).equals(
        ethers.parseEther("42")
      );
    });

    it("Should protect the cliff", async () => {
      const { vestingVault, sifa, owner } = await loadFixture(deployAll);
      const start = (await time.latest()) + 100;
      const duration = 420;

      await sifa.approve(vestingVault, 100);
      await vestingVault.vest(owner, 100, start, duration);

      await time.increaseTo(start - 10);

      expect(await vestingVault.vested(owner)).equals(100);
      expect(await vestingVault.released(owner)).equals(0);
      expect(await vestingVault.releasable(owner)).equals(0);
      await expect(vestingVault.release()).to.be.revertedWithCustomError(
        vestingVault,
        "VestingVaultNothingToRelease"
      );
    });

    it("Should release tokens with time", async () => {
      const { vestingVault, sifa } = await loadFixture(deployAll);
      const [_, account1] = await ethers.getSigners();

      const amount = ethers.parseEther("1000");
      const start = (await time.latest()) + 100;
      const duration = 1000;

      await sifa.approve(vestingVault, amount);
      await vestingVault.vest(account1, amount, start, duration);

      await time.increaseTo(start);
      expect(await vestingVault.vested(account1)).equals(amount);
      expect(await vestingVault.released(account1)).equals(0);
      expect(await vestingVault.releasable(account1)).equals(0);

      await time.increase(419);
      const expectedRelease = ethers.parseEther("420");
      const expectedRemainder = ethers.parseEther("580");
      await expect(vestingVault.connect(account1).release())
        .to.emit(vestingVault, "Released")
        .withArgs(expectedRelease, account1);
      expect(await sifa.balanceOf(account1)).equals(expectedRelease);
      expect(await vestingVault.vested(account1)).equals(amount);
      expect(await vestingVault.released(account1)).equals(expectedRelease);
      expect(await vestingVault.releasable(account1)).equals(0);

      await time.increase(1000);
      expect(await vestingVault.releasable(account1)).equals(expectedRemainder);

      await vestingVault.connect(account1).release();
      expect(await sifa.balanceOf(account1)).equals(amount);
    });
  });
});
