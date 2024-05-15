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
    it("Should drop with schedule", async () => {
      const { faucet, sifa, otherAccount } = await loadFixture(deployFaucet);

      sifa.transfer(faucet, ethers.parseEther("1000000"));

      expect(await faucet.connect(otherAccount).available()).equals(true);
      await expect(faucet.connect(otherAccount).drop()).to.emit(
        faucet,
        "Dropped"
      );
      expect(await sifa.balanceOf(otherAccount)).equals(
        ethers.parseEther("420")
      );

      await time.increase(100);

      expect(await faucet.connect(otherAccount).available()).equals(false);
      await expect(faucet.connect(otherAccount).drop()).to.be.revertedWith(
        "Wait"
      );

      await time.increase(60 * 60 * 24);

      expect(await faucet.connect(otherAccount).available()).equals(true);
      await expect(faucet.connect(otherAccount).drop()).to.emit(
        faucet,
        "Dropped"
      );
      expect(await sifa.balanceOf(otherAccount)).equals(
        ethers.parseEther("840")
      );
    });
  });
});
