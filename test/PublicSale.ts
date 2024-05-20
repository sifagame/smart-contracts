import {
  loadFixture,
  setBalance,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deployAll } from "./helpers";
import { ethers } from "hardhat";
import config from "../ignition/loadConfig";

describe("Public Sale", () => {
  describe("Constructor", () => {
    it("Should deploy", async () => {
      const [owner] = await ethers.getSigners();

      const SifaToken = await ethers.getContractFactory("SifaToken");
      const sifa = await SifaToken.deploy(owner);

      const Vault = await ethers.getContractFactory("Vault");
      const vault = await Vault.deploy(sifa);

      const VestingVault = await ethers.getContractFactory("VestingVault");
      const vestingVault = await VestingVault.deploy(sifa);

      const Emitter = await ethers.getContractFactory("Emitter");
      const emitter = await Emitter.deploy(owner, sifa, vault);

      const uniswapFactory = config.PublicSale.factory;
      const price = ethers.parseEther("0.000005");
      const minSale = ethers.parseEther((Math.random() * 100).toString());
      const maxSale = ethers.parseEther((Math.random() * 10000).toString());
      const start = (await time.latest()) + 1000;
      const duration = 86400;
      const cliff = start + duration + 100;
      const vestDuration = 3600;

      const PublicSale = await ethers.getContractFactory("PublicSale");
      const sale = await PublicSale.deploy(
        owner,
        sifa,
        emitter,
        vestingVault,
        uniswapFactory,
        price,
        minSale,
        maxSale,
        start,
        duration,
        cliff,
        vestDuration
      );

      expect(await sale.token()).equals(sifa);
      expect(await sale.emitter()).equals(emitter);
      expect(await sale.vesting()).equals(vestingVault);
      expect(await sale.factory()).equals(uniswapFactory);
      expect(await sale.price()).equals(price);
      expect(await sale.minSale()).equals(minSale);
      expect(await sale.maxSale()).equals(maxSale);
      expect(await sale.start()).equals(start);
      expect(await sale.duration()).equals(duration);
      expect(await sale.end()).equals(start + duration);
      expect(await sale.vestingCliff()).equals(cliff);
      expect(await sale.vestingDuraion()).equals(vestDuration);
    });
  });

  describe("Calculations", () => {
    it("Should calculate ETH per Token and reverse", async () => {
      const { sale } = await loadFixture(deployAll);
      expect(await sale.tokensPerEth(ethers.parseEther("42"))).equals(
        ethers.parseEther("84000000")
      );
      expect(await sale.ethPerTokens(ethers.parseEther("42000000"))).equals(
        ethers.parseEther("21")
      );
    });
  });

  describe("Buyer getters", () => {
    it("Should display correct buyer balance and existence", async () => {
      const { sale, sifa, owner, otherAccount } = await loadFixture(deployAll);

      expect(await sale.balanceOf(otherAccount)).equals(0);
      expect(await sale.buyerExists(otherAccount)).equals(false);

      await sifa.transfer(sale, ethers.parseEther("200000"));
      await time.increase(60 * 60 * 24 + 100);
      await otherAccount.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.1"),
      });

      expect(await sale.balanceOf(otherAccount)).equals(
        ethers.parseEther("200000")
      );
      expect(await sale.buyerExists(otherAccount)).equals(true);
    });
  });

  describe("Hardcap", () => {
    it("Should display hardcap", async () => {
      const { sale, sifa } = await loadFixture(deployAll);

      await sifa.transfer(sale, ethers.parseEther("42000000"));
      expect(await sale.hardcap()).equals(ethers.parseEther("42000000"));
    });
  });

  describe("Sales", () => {
    it("Should perform sales within time window and min-max-hardcap range", async () => {
      const { sale, sifa } = await loadFixture(deployAll);
      const [account1, account2, account3] = await ethers.getSigners();

      await sifa.transfer(sale, ethers.parseEther("3000000"));

      await expect(
        account1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.1"),
        })
      ).to.be.revertedWith("Sale not started");

      // Sale starts
      await time.increase(60 * 60 * 24 + 100);

      await expect(
        account1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.0099"),
        })
      ).to.be.revertedWith("Less than min");
      await expect(
        account1.sendTransaction({
          to: sale,
          value: ethers.parseEther("1.01"),
        })
      ).to.be.revertedWith("More than max");

      // Success Acc1 to buy 1600000 SIFA.
      await account1.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.5"),
      });
      await account1.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.3"),
      });

      await expect(
        account1.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.201"),
        })
      ).to.be.revertedWith("Total more then max");

      await account2.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.5"),
      });

      await expect(
        account2.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.201"),
        })
      ).to.be.revertedWith("Exceeds hardcap");

      await time.increase(60 * 60);

      await expect(
        account3.sendTransaction({
          to: sale,
          value: ethers.parseEther("0.1"),
        })
      ).to.be.revertedWith("Sale ended");

      expect(await sale.buyerExists(account1)).equals(true);
      expect(await sale.buyerExists(account2)).equals(true);
      expect(await sale.buyerExists(account3)).equals(false);
      expect(await sale.balanceOf(account1)).equals(
        ethers.parseEther("1600000")
      );
      expect(await sale.balanceOf(account2)).equals(
        ethers.parseEther("1000000")
      );
      expect(await sale.balanceOf(account3)).equals(0);
    });
  });

  describe("Finalize", () => {
    it("Should finalize", async () => {
      const { sale, sifa, vestingVault } = await loadFixture(deployAll);
      const [owner, account1, account2, account3] = await ethers.getSigners();

      await sifa.transfer(sale, ethers.parseEther("3000000"));

      // Sale starts
      await time.increaseTo((await sale.start()) + 1n);

      await account1.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.1"),
      });

      await account2.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.2"),
      });

      await account3.sendTransaction({
        to: sale,
        value: ethers.parseEther("0.3"),
      });

      await time.increaseTo((await sale.end()) + 1n);

      await expect(sale.finalize()).to.emit(sale, "Finalized");

      const start = await sale.vestingCliff();
      const duration = await sale.vestingDuraion();

      expect(await vestingVault.vested(account1)).equals(
        ethers.parseEther("200000")
      );
      expect(await vestingVault.start(account1)).equals(start);
      expect(await vestingVault.end(account1)).equals(start + duration);
      expect(await vestingVault.vested(account2)).equals(
        ethers.parseEther("400000")
      );
      expect(await vestingVault.vested(account3)).equals(
        ethers.parseEther("600000")
      );

      // owner receives ETH back
      expect(await ethers.provider.getBalance(owner)).greaterThan(
        ethers.parseEther("10000")
      );
    });

    it("Simulate more sales", async () => {
      const buyers = await ethers.getSigners();
      const { sale, sifa, vestingVault } = await loadFixture(deployAll);

      await sifa.transfer(sale, ethers.parseEther("200000000"));
      await time.increaseTo((await sale.start()) + 1n);

      for (let i = 0; i < buyers.length; i++) {
        const buyer = buyers[i];
        const amount = ethers.parseEther(
          (Math.random() * 0.7 + 0.2).toString()
        );
        await buyer.sendTransaction({
          to: sale,
          value: amount,
        });
      }

      await time.increaseTo((await sale.end()) + 1n);

      await expect(sale.finalize()).to.emit(sale, "Finalized");
    });

    it("Should revert not ended", async () => {
      const { sale } = await loadFixture(deployAll);

      await time.increaseTo((await sale.end()) - 100n);

      await expect(sale.finalize()).to.be.revertedWith("Sale not ended");
    });
  });
});
