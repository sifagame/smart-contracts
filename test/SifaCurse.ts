import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";

async function deploySifaCurse() {
  const [owner, gameContract, player, other] = await hre.ethers.getSigners();

  const SifaCurse = await hre.ethers.getContractFactory("SifaCurse");
  const curse = await SifaCurse.deploy(owner);
  await curse.setGameContract(gameContract);

  return { curse, owner, gameContract, player, other };
}

describe("SifaCurse", () => {
  describe("Deployment", () => {
    it("Should deploy with correct owner", async () => {
      const { curse, owner } = await loadFixture(deploySifaCurse);
      expect(await curse.owner()).to.equal(owner.address);
    });

    it("Should have correct game contract set", async () => {
      const { curse, gameContract } = await loadFixture(deploySifaCurse);
      expect(await curse.gameContract()).to.equal(gameContract.address);
    });

    it("Should have correct ERC721 metadata", async () => {
      const { curse } = await loadFixture(deploySifaCurse);
      expect(await curse.name()).to.equal("SifaCurse");
      expect(await curse.symbol()).to.equal("CURSE");
    });
  });

  describe("Mint", () => {
    it("Should mint when called by game contract", async () => {
      const { curse, gameContract, player } = await loadFixture(deploySifaCurse);

      await expect(curse.connect(gameContract).mint(player, 1))
        .to.emit(curse, "CurseMinted")
        .withArgs(1, player.address, 1);

      expect(await curse.ownerOf(1)).to.equal(player.address);
    });

    it("Should record mint timestamp", async () => {
      const { curse, gameContract, player } = await loadFixture(deploySifaCurse);

      const before = await time.latest();
      await curse.connect(gameContract).mint(player, 1);
      const after = await time.latest();

      const ts = await curse.mintTimestamps(1);
      expect(ts).to.be.gte(before);
      expect(ts).to.be.lte(after);
    });

    it("Should revert if called by non-game-contract", async () => {
      const { curse, player } = await loadFixture(deploySifaCurse);

      await expect(curse.connect(player).mint(player, 1))
        .to.be.revertedWithCustomError(curse, "CurseNotMinter")
        .withArgs(player.address);
    });

    it("Should revert if called by owner (not game contract)", async () => {
      const { curse, owner, player } = await loadFixture(deploySifaCurse);

      await expect(curse.connect(owner).mint(player, 1))
        .to.be.revertedWithCustomError(curse, "CurseNotMinter")
        .withArgs(owner.address);
    });
  });

  describe("Transfer Lock", () => {
    it("Should block transferFrom within 30 days", async () => {
      const { curse, gameContract, player, other } =
        await loadFixture(deploySifaCurse);

      await curse.connect(gameContract).mint(player, 1);
      await time.increase(29 * 24 * 60 * 60); // 29 days

      const mintTs = await curse.mintTimestamps(1);
      const unlockTime = mintTs + BigInt(30 * 24 * 60 * 60);

      await expect(curse.connect(player).transferFrom(player, other, 1))
        .to.be.revertedWithCustomError(curse, "CurseTransferLocked")
        .withArgs(1, unlockTime);
    });

    it("Should block safeTransferFrom within 30 days", async () => {
      const { curse, gameContract, player, other } =
        await loadFixture(deploySifaCurse);

      await curse.connect(gameContract).mint(player, 1);

      const mintTs = await curse.mintTimestamps(1);
      const unlockTime = mintTs + BigInt(30 * 24 * 60 * 60);

      await expect(curse.connect(player).safeTransferFrom(player, other, 1))
        .to.be.revertedWithCustomError(curse, "CurseTransferLocked")
        .withArgs(1, unlockTime);
    });

    it("Should allow transferFrom after 30 days", async () => {
      const { curse, gameContract, player, other } =
        await loadFixture(deploySifaCurse);

      await curse.connect(gameContract).mint(player, 1);
      await time.increase(30 * 24 * 60 * 60 + 1); // 30 days + 1 second

      await curse.connect(player).transferFrom(player, other, 1);
      expect(await curse.ownerOf(1)).to.equal(other.address);
    });

    it("Should allow safeTransferFrom after 30 days", async () => {
      const { curse, gameContract, player, other } =
        await loadFixture(deploySifaCurse);

      await curse.connect(gameContract).mint(player, 1);
      await time.increase(30 * 24 * 60 * 60 + 1);

      await curse.connect(player).safeTransferFrom(player, other, 1);
      expect(await curse.ownerOf(1)).to.equal(other.address);
    });
  });
});
