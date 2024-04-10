import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("SifaToken", function () {
  async function deploySifaToken() {
    const [owner, otherAccount] = await hre.ethers.getSigners();
    const SifaToken = await hre.ethers.getContractFactory("SifaToken");
    const sifa = await SifaToken.deploy(owner);

    return { sifa, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should have correct owner, name and supply", async function () {
      const { sifa, owner } = await loadFixture(deploySifaToken);

      expect(await sifa.owner()).to.equal(owner);
      expect(await sifa.name()).to.equal("sifa.game");
      expect(await sifa.symbol()).to.equal("SIFA");
      expect(await sifa.totalSupply()).to.equal(1000000000000000000000000000n);
    });
  });
});
