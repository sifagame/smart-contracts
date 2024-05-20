import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deployAll } from "./helpers";

describe("SifaToken", function () {
  describe("Deployment", function () {
    it("Should have correct owner, name and supply", async function () {
      const { sifa, owner } = await loadFixture(deployAll);

      expect(await sifa.owner()).to.equal(owner);
      expect(await sifa.name()).to.equal("sifa.game");
      expect(await sifa.symbol()).to.equal("SIFA");
      expect(await sifa.totalSupply()).to.equal(1000000000000000000000000000n);
    });
  });
});
