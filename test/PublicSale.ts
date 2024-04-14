import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { deployPublicSale, deployRewardsLock } from "./helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("PublicSale", () => {
  describe("Deployments", () => {
    it("Should revert if start time is in the past", async () => {
      const [owner] = await ethers.getSigners();
      const { lock, sifa } = await loadFixture(deployRewardsLock);
      const PublicSale = await ethers.getContractFactory("PublicSale");
      const start = (await time.latest()) - 1;
      const end = (await time.latest()) + 86400 * 15;
      const unlock = (await time.latest()) + 86400 * 17;
      await expect(
        PublicSale.deploy(owner, sifa, lock, start, end, unlock)
      ).to.revertedWith("Start in the past");
    });

    it("Should revert if end time is before start", async () => {
      const [owner] = await ethers.getSigners();
      const { lock, sifa } = await loadFixture(deployRewardsLock);
      const PublicSale = await ethers.getContractFactory("PublicSale");
      const start = (await time.latest()) + 86400 * 2;
      const end = (await time.latest()) + 86400;
      const unlock = (await time.latest()) + 86400 * 17;
      await expect(
        PublicSale.deploy(owner, sifa, lock, start, end, unlock)
      ).to.revertedWith("End before start");
    });

    it("Should revert if unlock time is before end", async () => {
      const [owner] = await ethers.getSigners();
      const { lock, sifa } = await loadFixture(deployRewardsLock);
      const PublicSale = await ethers.getContractFactory("PublicSale");
      const start = (await time.latest()) + 86400 * 2;
      const end = (await time.latest()) + 86400 * 5;
      const unlock = (await time.latest()) + 86400 * 4;
      await expect(
        PublicSale.deploy(owner, sifa, lock, start, end, unlock)
      ).to.revertedWith("Unlock before end");
    });

    it("Should deploy with correct settings", async () => {
      const { sale, lock } = await loadFixture(deployPublicSale);
      expect(await sale.tokensPerEth()).to.equal(2000000);
      expect(await sale.minSale()).to.equal(20000);
      expect(await sale.maxSale()).to.equal(2000000);
      expect(await sale.saleAmount()).to.equal(0);
      expect(await sale.unsoldContract()).to.equal(lock);
    });
  });

  describe("Deposit", () => {
    it("Should make single deposit", async () => {
      const { sale, sifa } = await loadFixture(deployPublicSale);
      await sifa.approve(sale, 6000);
      await sale.deposit(6000);
      expect(await sale.saleAmount()).to.equal(4000);
    });

    it("Should make multiple deposits", async () => {
      const { sale, sifa } = await loadFixture(deployPublicSale);
      await sifa.approve(sale, 126000);
      await sale.deposit(63000);
      expect(await sale.saleAmount()).to.equal(42000);
      await sale.deposit(63000);
      expect(await sale.saleAmount()).to.equal(84000);
    });

    it("Should revert if sale started", async () => {
      const { sale, sifa, start } = await loadFixture(deployPublicSale);
      time.increaseTo(start + 100);
      await sifa.approve(sale, 126000);
      await expect(sale.deposit(63000)).to.be.revertedWith("Sale started");
    });
  });

  describe("Sales", () => {
    it("Should revert before sale", async () => {
      const { buyer1, sale, start } = await loadFixture(deployPublicSale);
      await time.increaseTo(start - 100);
      await expect(
        buyer1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.1"),
        })
      ).to.be.revertedWithCustomError(sale, "ESaleIsNotActive");
    });

    it("Should revert after sale", async () => {
      const { buyer1, sale, end } = await loadFixture(deployPublicSale);
      await time.increaseTo(end + 100);
      await expect(
        buyer1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.1"),
        })
      ).to.be.revertedWithCustomError(sale, "ESaleIsNotActive");
    });

    it("Should revert less than min", async () => {
      const { sifa, buyer1, sale, start } = await loadFixture(deployPublicSale);
      await sifa.approve(sale, ethers.parseEther("330000000"));
      await sale.deposit(ethers.parseEther("330000000"));
      await time.increaseTo(start + 1);
      await expect(
        buyer1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.0099"),
        })
      ).to.be.revertedWith("Less than min sale");
    });

    it("Should revert more than than max", async () => {
      const { sifa, buyer1, sale, start } = await loadFixture(deployPublicSale);
      await sifa.approve(sale, ethers.parseEther("330000000"));
      await sale.deposit(ethers.parseEther("330000000"));
      await time.increaseTo(start + 1);
      await expect(
        buyer1.sendTransaction({
          to: sale,
          value: ethers.parseEther("1.01"),
        })
      ).to.be.revertedWith("More than max sale");
    });

    it("Should revert more than than max multi buy", async () => {
      const { sifa, buyer1, sale, start } = await loadFixture(deployPublicSale);
      await sifa.approve(sale, ethers.parseEther("330000000"));
      await sale.deposit(ethers.parseEther("330000000"));
      await time.increaseTo(start + 1);

      const buyAmount = ethers.parseEther("0.6");

      await buyer1.sendTransaction({
        to: sale,
        value: buyAmount,
      });
      await expect(
        buyer1.sendTransaction({
          to: sale,
          value: buyAmount,
        })
      ).to.be.revertedWith("More than max sale");
    });

    it("Should revert more then remaining", async () => {
      const { sifa, buyer1, sale, start } = await loadFixture(deployPublicSale);
      await sifa.approve(sale, ethers.parseEther("1000000"));
      await sale.deposit(ethers.parseEther("1000000"));
      await time.increaseTo(start + 1);
      await expect(
        buyer1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.7"),
        })
      ).to.be.revertedWith("Remaining sale amount is less then requested");
    });

    it("Should perform multiple sales", async () => {
      const { sifa, buyer1, buyer2, sale, start } = await loadFixture(
        deployPublicSale
      );
      await sifa.approve(sale, ethers.parseEther("15000000"));
      await sale.deposit(ethers.parseEther("15000000"));
      await time.increaseTo(start + 1);
      await buyer1.sendTransaction({
        to: sale,
        value: ethers.parseEther("1"),
      });
      await buyer2.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.5"),
      });
      expect(await sale.balanceOf(buyer1)).to.equal(
        ethers.parseEther("2000000")
      );
      expect(await sale.balanceOf(buyer2)).to.equal(
        ethers.parseEther("1000000")
      );
      expect(await sale.saleAmount()).to.equal(ethers.parseEther("7000000"));
    });
  });

  describe("Withdraw", () => {
    it("Should revert if locked", async () => {
      const { sifa, buyer1, sale, start, end, unlock } = await loadFixture(
        deployPublicSale
      );
      await sifa.approve(sale, ethers.parseEther("15000000"));
      await sale.deposit(ethers.parseEther("15000000"));
      await time.increaseTo(start + 1);
      await buyer1.sendTransaction({
        to: sale,
        value: ethers.parseEther("1"),
      });
      await time.increaseTo(unlock - 100);
      await expect(
        sale.connect(buyer1).withdraw()
      ).to.be.revertedWithCustomError(sale, "ETokensAreLocked");
    });

    it("Should revert if nothing to withdraw", async () => {
      const { sifa, buyer1, sale, start, end, unlock } = await loadFixture(
        deployPublicSale
      );
      await sifa.approve(sale, ethers.parseEther("15000000"));
      await sale.deposit(ethers.parseEther("15000000"));
      await time.increaseTo(unlock + 100);
      await expect(sale.connect(buyer1).withdraw()).to.be.revertedWith(
        "Nothing to withdraw"
      );
    });

    it("Should withdraw correct amount", async () => {
      const { sifa, buyer1, sale, start, end, unlock } = await loadFixture(
        deployPublicSale
      );
      await sifa.approve(sale, ethers.parseEther("15000000"));
      await sale.deposit(ethers.parseEther("15000000"));
      await time.increaseTo(start + 1);
      await buyer1.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.3"),
      });
      await time.increaseTo(unlock + 100);
      await expect(sale.connect(buyer1).withdraw()).to.emit(sale, "Withdrawn");
      expect(await sifa.balanceOf(buyer1)).to.equal(
        ethers.parseEther("600000")
      );
    });
  });
});
