import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployEmitter, initializeEmitterVaultConnection } from "./helpers";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("Emitter", function () {
  describe("Deployment", () => {
    it("Should have correct owner, token and initial supply", async () => {
      const { emitter, vault, sifa } = await loadFixture(deployEmitter);

      expect(await emitter.token()).to.equal(sifa);
      expect(await emitter.vault()).to.equal(vault);
      expect(await emitter.epochLength()).to.equal(2592000n);
      expect(await emitter.rate()).to.equal(ethers.parseEther("10"));
      expect(await emitter.started()).to.equal(0);
      expect(await emitter.released()).to.equal(0);
      expect(await emitter.locked()).to.equal(0);
    });
  });

  describe("epochAt", () => {
    it("Should return correct epoch if not started", async () => {
      const { emitter } = await loadFixture(deployEmitter);

      // Ensure not started.
      expect(await emitter.started()).to.equal(0);

      const now = await time.latest();
      const tenMinutes = now + 600;
      const threeMonths = now + 2595000 * 3;
      expect(await emitter.epochAt(now)).to.equal(0);
      expect(await emitter.epochAt(tenMinutes)).to.equal(0);
      expect(await emitter.epochAt(threeMonths)).to.equal(0);
    });

    it("Should return correct epoch if started", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);

      const amount = ethers.parseEther("1000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      const now = await time.latest();
      const tenMinutes = now + 600;
      const threeMonths = now + 2592000 * 3;
      const elevenYears = now + 2592000 * 125;
      expect(await emitter.epochAt(now)).to.equal(0);
      expect(await emitter.epochAt(tenMinutes)).to.equal(0);
      expect(await emitter.epochAt(threeMonths)).to.equal(3);
      expect(await emitter.epochAt(elevenYears)).to.equal(125);
    });
  });

  describe("Epoch", () => {
    it("Should return correct epoch if not started", async () => {
      const { emitter } = await loadFixture(deployEmitter);
      // Ensure not started.
      expect(await emitter.started()).to.equal(0);

      expect(await emitter.epoch()).to.equal(0);

      // Simulate 3 months wait
      const epochLength = await emitter.epochLength();
      await time.increase(epochLength * 3n);

      expect(await emitter.epoch()).to.equal(0);
    });

    it("Should return correct epoch if started", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);

      const amount = ethers.parseEther("1000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      expect(await emitter.epoch()).to.equal(0);

      // Simulate 42 months wait
      const epochLength = await emitter.epochLength();
      await time.increase(epochLength * 42n - 1n);

      expect(await emitter.epoch()).to.equal(41);

      // Try to get out of the schedule
      await time.increase(epochLength * 100n);
      expect(await emitter.epoch()).to.equal(141);
    });
  });

  describe("Rate", () => {
    it("Should have corrent rates", async () => {
      const { emitter } = await loadFixture(deployEmitter);

      expect(await emitter.rates(0)).equals(ethers.parseEther("10"));
      expect(await emitter.rates(1)).equals(
        ethers.parseEther("9.68260151561632")
      );
      expect(await emitter.rates(119)).equals(
        ethers.parseEther("0.215305447128642020")
      );
      expect(await emitter.rates(120)).equals(
        ethers.parseEther("0.215305447128642020")
      );
    });

    it("Should return constant rate if not started", async () => {
      const { emitter } = await loadFixture(deployEmitter);
      const epochLength = await emitter.epochLength();

      expect(await emitter.rate()).to.equal(ethers.parseEther("10"));
      await time.increase(epochLength - 1n);
      // till the last second of the first epoch
      expect(await emitter.rate()).to.equal(ethers.parseEther("10"));

      // to the next epoch
      await time.increase(epochLength * 42n);
      expect(await emitter.rate()).to.equal(ethers.parseEther("10"));
    });

    it("Should return rates for the current epoch", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const epochLength = await emitter.epochLength();

      const amount = ethers.parseEther("1000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      expect(await emitter.rate()).to.equal(ethers.parseEther("10"));
      await time.increase(epochLength - 1n);
      // till the last second of the first epoch
      expect(await emitter.rate()).to.equal(ethers.parseEther("10"));

      // to the next epoch
      await time.increase(epochLength);
      expect(await emitter.epoch()).to.equal(1);
      expect(await emitter.rate()).to.equal(
        ethers.parseEther("9.68260151561632")
      );

      // exceed epoch count
      await time.increase(epochLength * 200n);
      expect(await emitter.epoch()).greaterThan(120);
      expect(await emitter.rate()).to.equal(
        ethers.parseEther("0.215305447128642020")
      );
    });
  });

  describe("Available", () => {
    it("Should return 0 if not started", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const amount = ethers.parseEther("800000000");
      await sifa.transfer(emitter, amount);

      await time.increase(42);
      expect(await emitter.available()).equals(0);
    });

    it("Should return 0 if empty", async () => {
      const { emitter } = await initializeEmitterVaultConnection(800000000, 1);
      const epochLength = await emitter.epochLength();

      // Assert we wait 1000 months, should withdraw all 800M.
      await time.increase(epochLength * 1000n);
      await emitter.withdraw();

      expect(await emitter.available()).equals(0);
    });

    it("Should return 10 for 1 second", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const amount = ethers.parseEther("800000000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      expect(await emitter.available()).equals(0);
      await time.increase(1);
      expect(await emitter.available()).equals(ethers.parseEther("10"));
    });

    it("Should return 420 for 42 seconds", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const amount = ethers.parseEther("800000000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      expect(await emitter.available()).equals(0);
      await time.increase(42);
      expect(await emitter.available()).equals(ethers.parseEther("420"));
    });

    it("Should return correct amount for strict epoch", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const epochLength = await emitter.epochLength();
      const epoch = await emitter.epoch();
      const epochRate = await emitter.rates(epoch);

      const amount = ethers.parseEther("800000000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      expect(await emitter.available()).equals(ethers.parseEther("0"));
      await time.increase(epochLength);
      expect(await emitter.available()).equals(ethers.parseEther("25920000"));
    });

    it("Should return correct amount across multiple epoch", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const epochLength = await emitter.epochLength();
      const epoch = await emitter.epoch();
      const epochRate = await emitter.rates(epoch);

      const amount = ethers.parseEther("800000000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      await time.increase(epochLength + 5n);
      expect(await emitter.available()).equals(
        ethers.parseEther("25920048.4130075780816")
      );
    });

    it("Should emit 99.9% at the end of last epoch and available after", async () => {
      const { emitter, sifa, vault, owner } = await loadFixture(deployEmitter);
      const epochLength = await emitter.epochLength();
      const amount = ethers.parseEther("800000000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      await time.increase(epochLength * 120n - 5n);

      const available = await emitter.available();
      const result = Number(available) / Number(amount);

      expect(result).greaterThan(0.999);

      await emitter.withdraw();

      await time.increase(100);
      expect(await emitter.available()).greaterThan(0);
    });
  });

  describe("Start", () => {
    it("Should not start empty", async () => {
      const { emitter } = await loadFixture(deployEmitter);
      await expect(emitter.start()).to.be.revertedWith("No tokens");
      expect;
    });

    it("Should start", async () => {
      const { emitter, sifa, owner } = await loadFixture(deployEmitter);
      const amount = ethers.parseEther("1000");
      await sifa.transfer(emitter, amount);

      await expect(emitter.start()).to.emit(emitter, "Started").withArgs(owner);

      const started = await time.latest();
      expect(await emitter.started()).equals(started);
    });

    it("Should not restart", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const amount = ethers.parseEther("1000");
      await sifa.transfer(emitter, amount);
      await emitter.start();

      const started = await emitter.started();
      await time.increase(100);

      await expect(emitter.start()).to.be.revertedWith("Already started");
      expect(await emitter.started()).equals(started);
    });
  });

  describe("Withdraw", () => {
    it("Should revert lock not started", async () => {
      const { emitter, sifa } = await loadFixture(deployEmitter);
      const amount = ethers.parseEther("1000");
      await sifa.transfer(emitter, amount);
      await time.increase(100);
      await expect(emitter.withdraw()).to.be.revertedWith("Not started");
    });

    it("Should withdraw in first epoch", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(1000, 1);
      const rate = await emitter.rate();
      const started = await emitter.lastWithrawalAt();

      await time.increaseTo(started + 42n);
      // 43 because +1 second.
      await expect(emitter.withdraw())
        .to.emit(emitter, "Withdrawn")
        .withArgs(owner, vault, rate * 43n);

      // 43 * 10 + 1 (was deposited during init)
      expect(await sifa.balanceOf(vault)).equals(ethers.parseEther("431"));
    });

    it("Should revert if empty", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(1000, 1);
      const epochLength = await emitter.epochLength();

      // Assert we wait 1000 months, should withdraw all 800M.
      await time.increase(epochLength * 1000n);
      await emitter.withdraw();

      await expect(emitter.withdraw()).to.be.revertedWith("Nothing to unlock");
    });

    it("Should withdraw in exact epoch", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(800000000, 1);
      const epochLength = await emitter.epochLength();
      const started = await emitter.lastWithrawalAt();

      await time.increaseTo(started + epochLength - 1n);
      await expect(emitter.withdraw())
        .to.emit(emitter, "Withdrawn")
        .withArgs(owner, vault, ethers.parseEther("25920000"));

      expect(await sifa.balanceOf(vault)).equals(ethers.parseEther("25920001"));
    });

    it("Should withdraw across epochs", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(800000000, 1);
      const epochLength = await emitter.epochLength();
      const started = await emitter.lastWithrawalAt();

      await time.increaseTo(started + epochLength + 1n);
      await expect(emitter.withdraw())
        .to.emit(emitter, "Withdrawn")
        // 25920000 from the epoch0 plus 2 ticks from epoch1
        .withArgs(owner, vault, ethers.parseEther("25920019.36520303123264"));

      expect(await sifa.balanceOf(vault)).equals(
        ethers.parseEther("25920020.36520303123264")
      );
    });

    it("Should withdraw a small portion after last epoch, vault has full emission", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(800000000, 1);
      const epochLength = await emitter.epochLength();
      const started = await emitter.lastWithrawalAt();

      await time.increaseTo(started + epochLength * 120n);

      await emitter.withdraw();

      await time.increase(epochLength);

      await expect(emitter.withdraw()).to.emit(emitter, "Withdrawn");

      expect(await sifa.balanceOf(vault)).equals(
        ethers.parseEther("800000001")
      );
    });

    it("Should perform multiple withdrawals across random time", async () => {
      const { emitter, vault, sifa, owner } =
        await initializeEmitterVaultConnection(800000000, 1);
      const epochLength = await emitter.epochLength();

      await time.increase(100);

      while ((await emitter.available()) > 0) {
        await expect(emitter.withdraw()).to.emit(emitter, "Withdrawn");
        const addTime = Math.floor(Math.random() * Number(epochLength));
        await time.increase(addTime);
      }

      expect(await sifa.balanceOf(vault)).equals(
        ethers.parseEther("800000001")
      );
    });
  });
});
