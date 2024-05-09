import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deployVestingVault } from "./helpers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Vesting Vault", () => {
  describe("Deployment", () => {
    it("Should deploy", async () => {
      const { vestingVault, sifa } = await loadFixture(deployVestingVault);

      expect(await vestingVault.start()).to.equal(0);
      expect(await vestingVault.end()).to.equal(0);
      expect(await vestingVault.duration()).to.equal(0);
    });
  });

  describe("Setup", () => {
    it("Should revert start in past", async () => {
      const { vestingVault } = await loadFixture(deployVestingVault);
      const now = await time.latest();
      const duration = 100;
      await expect(
        vestingVault.setup(now, duration)
      ).to.revertedWithCustomError(vestingVault, "VestingVaultStartInPast");
    });

    it("Should revert zero duration", async () => {
      const { vestingVault } = await loadFixture(deployVestingVault);
      const now = await time.latest();
      const duration = 0;
      await expect(
        vestingVault.setup(now + 100, duration)
      ).to.revertedWithCustomError(vestingVault, "VestingVaultZeroDuration");
    });

    it("Should setup successfully", async () => {
      const { vestingVault } = await loadFixture(deployVestingVault);
      const start = (await time.latest()) + 100;
      const duration = 420;
      await expect(vestingVault.setup(start, duration))
        .to.emit(vestingVault, "Setup")
        .withArgs(start, duration);
    });

    it("Should revert already setup", async () => {
      const { vestingVault } = await loadFixture(deployVestingVault);
      const start = (await time.latest()) + 100;
      const duration = 420;
      await expect(vestingVault.setup(start, duration))
        .to.emit(vestingVault, "Setup")
        .withArgs(start, duration);

      await expect(
        vestingVault.setup(start + 1, duration + 10)
      ).to.revertedWithCustomError(vestingVault, "VestingVaultAlreadySetup");
    });
  });

  describe("Timing functions", () => {
    it("Should return correct time", async () => {
      const { vestingVault } = await loadFixture(deployVestingVault);
      const now = Number(await time.latest());
      const start = now + 1800;
      const duration = 3600;
      await expect(vestingVault.setup(start, duration))
        .to.emit(vestingVault, "Setup")
        .withArgs(start, duration);

      expect(await vestingVault.start()).equals(start);
      expect(await vestingVault.duration()).equals(duration);
      expect(await vestingVault.end()).equals(start + duration);
    });
  });

  describe("Vest", () => {
    it("Should revert after start", async () => {
      const { vestingVault, owner } = await loadFixture(deployVestingVault);
      const start = (await time.latest()) + 100;
      const duration = 420;
      await vestingVault.setup(start, duration);
      await time.increaseTo(start + 5);

      await expect(vestingVault.vest(owner, 100)).to.revertedWithCustomError(
        vestingVault,
        "VestingVaultVestAfterStart"
      );
    });

    it("Should vest", async () => {
      const { vestingVault, sifa, owner } = await loadFixture(
        deployVestingVault
      );
      const start = (await time.latest()) + 100;
      const duration = 420;
      await vestingVault.setup(start, duration);

      await sifa.approve(vestingVault, 100);

      await expect(vestingVault.vest(owner, 100))
        .to.emit(vestingVault, "Vested")
        .withArgs(100, owner);
    });
  });

  describe("Schedules", () => {
    it("Should make 1 token per second available", async () => {
      const { vestingVault, sifa } = await loadFixture(deployVestingVault);
      const [_, account1] = await ethers.getSigners();

      const amount = ethers.parseEther("1000");
      const start = (await time.latest()) + 100;
      const duration = 1000;
      await vestingVault.setup(start, duration);
      await sifa.approve(vestingVault, amount);
      await vestingVault.vest(account1, amount);

      await time.increaseTo(start);
      expect(await vestingVault.connect(account1).vested()).equals(amount);
      expect(await vestingVault.connect(account1).released()).equals(0);
      expect(await vestingVault.connect(account1).releasable()).equals(0);

      await time.increase(10);
      expect(await vestingVault.connect(account1).vested()).equals(amount);
      expect(await vestingVault.connect(account1).released()).equals(0);
      expect(await vestingVault.connect(account1).releasable()).equals(
        ethers.parseEther("10")
      );

      await time.increase(32);
      expect(await vestingVault.connect(account1).vested()).equals(amount);
      expect(await vestingVault.connect(account1).released()).equals(0);
      expect(await vestingVault.connect(account1).releasable()).equals(
        ethers.parseEther("42")
      );
    });

    it("Should protect the cliff", async () => {
      const { vestingVault, sifa, owner } = await loadFixture(
        deployVestingVault
      );
      const start = (await time.latest()) + 100;
      const duration = 420;
      await vestingVault.setup(start, duration);

      await sifa.approve(vestingVault, 100);
      await vestingVault.vest(owner, 100);

      await time.increaseTo(start - 10);

      expect(await vestingVault.vested()).equals(100);
      expect(await vestingVault.released()).equals(0);
      expect(await vestingVault.releasable()).equals(0);
      await expect(vestingVault.release()).to.be.revertedWithCustomError(
        vestingVault,
        "VestingVaultNothingToRelease"
      );
    });

    it("Should release tokens with time", async () => {
      const { vestingVault, sifa } = await loadFixture(deployVestingVault);
      const [_, account1] = await ethers.getSigners();

      const amount = ethers.parseEther("1000");
      const start = (await time.latest()) + 100;
      const duration = 1000;
      await vestingVault.setup(start, duration);
      await sifa.approve(vestingVault, amount);
      await vestingVault.vest(account1, amount);

      await time.increaseTo(start);
      expect(await vestingVault.connect(account1).vested()).equals(amount);
      expect(await vestingVault.connect(account1).released()).equals(0);
      expect(await vestingVault.connect(account1).releasable()).equals(0);

      await time.increase(419);
      const expectedRelease = ethers.parseEther("420");
      const expectedRemainder = ethers.parseEther("580");
      await expect(vestingVault.connect(account1).release())
        .to.emit(vestingVault, "Released")
        .withArgs(expectedRelease);
      expect(await sifa.balanceOf(account1)).equals(expectedRelease);
      expect(await vestingVault.connect(account1).vested()).equals(amount);
      expect(await vestingVault.connect(account1).released()).equals(
        expectedRelease
      );
      expect(await vestingVault.connect(account1).releasable()).equals(0);

      await time.increase(1000);
      expect(await vestingVault.connect(account1).releasable()).equals(
        expectedRemainder
      );

      await vestingVault.connect(account1).release();
      expect(await sifa.balanceOf(account1)).equals(amount);
    });

    it("Should vest and withdraw for multiple accounts", async () => {
      const accounts = await ethers.getSigners();
      const amounts = [];
      const { vestingVault, sifa } = await loadFixture(deployVestingVault);

      const startTime = (await time.latest()) + 1000;
      const duration = 60 * 60 * 24;
      await vestingVault.setup(startTime, duration);

      // Vest tokens.
      for (let i = 0; i < 5; i++) {
        const amount = ethers.parseEther((Math.random() * 1000000).toString());
        amounts.push(amount);
        await sifa.approve(vestingVault, amount);
        await vestingVault.vest(accounts[i], amount);
      }

      // Burn remaining.
      const remain = await sifa.balanceOf(accounts[0]);
      await sifa.transfer("0x000000000000000000000000000000000000dEaD", remain);
      expect(await sifa.balanceOf(accounts[0])).equals(0);

      const start = await vestingVault.start();
      let currentTime = Number(start);
      const end = Number(await vestingVault.end());

      // Release by portion.
      while (currentTime < end) {
        const timeDiff = Math.floor(Math.random() * 60 * 60) + 1800;
        currentTime = (await time.latest()) + timeDiff;
        await time.increaseTo(currentTime);

        for (let i = 0; i < 5; i++) {
          await expect(vestingVault.connect(accounts[i]).release()).to.emit(
            vestingVault,
            "Released"
          );
        }
      }

      // Check balances.
      for (let i = 0; i < 5; i++) {
        expect(await sifa.balanceOf(accounts[i])).equals(amounts[i]);
      }
    });
  });
});
