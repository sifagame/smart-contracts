import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deployVault } from "./helpers";

describe("Vault", function () {
  describe("Deployment", function () {
    it("Should have correct asset and initial supply", async function () {
      const { vault, sifa } = await loadFixture(deployVault);

      expect(await vault.name()).equals("Sifa Vault");
      expect(await vault.symbol()).equals("vSIFA");
      expect(await vault.asset()).to.equal(sifa);
      expect(await vault.totalSupply()).to.equal(0);
      expect(await vault.decimals()).equals(18);
    });
  });
});
