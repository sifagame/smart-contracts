import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFaucet, deploySifaToken } from "./helpers";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("Faucet", () => {
  describe("Construct", () => {
    it("Should deploy", async () => {
      const { sifa } = await loadFixture(deploySifaToken);
      const Faucet = await ethers.getContractFactory("Faucet");
      const faucet = await Faucet.deploy(sifa, 420, 60);

      expect(await faucet.TOKEN()).equals(sifa);
      expect(await faucet.DROP_AMOUNT()).equals(420);
      expect(await faucet.DELAY()).equals(60);
    });
  });

  describe("Drop", () => {
    it("Require ETH", async () => {
      const { faucet, sifa, owner } = await loadFixture(deployFaucet);
      sifa.transfer(faucet, ethers.parseEther("1000000"));

      const user = ethers.Wallet.createRandom();
      await owner.sendTransaction({
        to: user,
        value: ethers.parseEther("0.0009"),
      });
      await expect(faucet.drop(user)).to.be.revertedWith("Own more 0.001 ETH");
    });

    it("Should drop with schedule", async () => {
      const { faucet, sifa, otherAccount } = await loadFixture(deployFaucet);

      sifa.transfer(faucet, ethers.parseEther("1000000"));

      expect(await faucet.available(otherAccount)).equals(true);
      await expect(faucet.connect(otherAccount).drop(otherAccount)).to.emit(
        faucet,
        "Dropped"
      );
      expect(await sifa.balanceOf(otherAccount)).equals(
        ethers.parseEther("420")
      );

      await time.increase(100);

      expect(await faucet.available(otherAccount)).equals(false);
      await expect(
        faucet.connect(otherAccount).drop(otherAccount)
      ).to.be.revertedWith("Wait");

      await time.increase(60 * 60 * 24);

      expect(await faucet.available(otherAccount)).equals(true);
      await expect(faucet.connect(otherAccount).drop(otherAccount)).to.emit(
        faucet,
        "Dropped"
      );
      expect(await sifa.balanceOf(otherAccount)).equals(
        ethers.parseEther("840")
      );
    });
  });
});
