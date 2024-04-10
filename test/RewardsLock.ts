import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployRewardsLock } from "./helpers";

import { expect } from "chai";

describe("RewardsLock", function () {
  describe("Deployment", () => {
    it("Should have correct owner, token and initial supply", async () => {
      const { lock, vault, sifa } = await loadFixture(deployRewardsLock);

      expect(await lock.token()).to.equal(sifa);
      expect(await lock.vault()).to.equal(vault);
      expect(await lock.releaseRate()).to.equal(5000000000000000000n);
      expect(await lock.start()).to.equal(0);
      expect(await lock.unlocked()).to.equal(0);
      expect(await lock.locked()).to.equal(0);
    });
  });

  describe("Deposit and withdraw", () => {
    it("Should make deposit", async () => {
      const amount = 1000_000000000000000000n;
      const { lock, vault, sifa } = await loadFixture(deployRewardsLock);
      await sifa.approve(lock, amount);
      await lock.deposit(amount);
      const timestamp = await time.latest();
      expect(await lock.start()).to.equal(timestamp);

      await time.increase(42);
      expect(await lock.available()).to.equal(210_000000000000000000n);

      await lock.withdraw();
      // Using GTE in case of 1 second more passed.
      expect(await sifa.balanceOf(vault)).to.greaterThanOrEqual(
        210_000000000000000000n
      );
      expect(await lock.available()).to.equal(0);
      const unlocked = await lock.unlocked();
      const locked = await lock.locked();
      expect(locked + unlocked === amount);

      // Wait enough to unlock all.
      await time.increase(42000);
      expect(await lock.available()).to.equal(locked);
      await lock.withdraw();
      expect(await sifa.balanceOf(vault)).to.equal(1000_000000000000000000n);
      expect(await lock.unlocked()).to.equal(1000_000000000000000000n);
      expect(await lock.locked()).to.equal(0);

      await time.increase(100);
      await expect(lock.withdraw()).to.be.revertedWith("Nothing to unlock");
    });
  });
});
