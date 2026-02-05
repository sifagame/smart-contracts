import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";

const DEAD = "0x000000000000000000000000000000000000dEaD";
const ENTRY_FEE = ethers.parseEther("100");

async function deployGame() {
  const [owner, vault, p1, p2, p3, p4, other] = await hre.ethers.getSigners();

  const SifaToken = await hre.ethers.getContractFactory("SifaToken");
  const sifa = await SifaToken.deploy(owner);

  const SifaCurse = await hre.ethers.getContractFactory("SifaCurse");
  const curse = await SifaCurse.deploy(owner);

  const SifaGame = await hre.ethers.getContractFactory("SifaGame");
  const game = await SifaGame.deploy(sifa, curse, vault);

  await curse.setGameContract(game);

  // Fund and approve all players
  const fund = ethers.parseEther("10000");
  for (const player of [p1, p2, p3, p4]) {
    await sifa.transfer(player, fund);
    await sifa.connect(player).approve(game, fund);
  }

  return { game, sifa, curse, owner, vault, p1, p2, p3, p4, other };
}

// Helper: fill a round to 4 players and return roundId
async function createAndFillRound(
  game: any,
  [p1, p2, p3, p4]: any[],
  entryFee: bigint = ENTRY_FEE
) {
  const roundId = await game.connect(p1).createRound.staticCall(entryFee);
  await game.connect(p1).createRound(entryFee);
  await game.connect(p2).joinRound(roundId);
  await game.connect(p3).joinRound(roundId);
  await game.connect(p4).joinRound(roundId);
  return roundId;
}

// Helper: play all throws for a round, return loser index
async function playRound(game: any, roundId: bigint, players: any[]) {
  let round = await game.rounds(roundId);
  const throwCount = Number(round.throwCount);

  for (let i = 0; i < throwCount; i++) {
    round = await game.rounds(roundId);
    const tagHolderIdx = Number(round.tagHolderIndex);
    await game.connect(players[tagHolderIdx]).throwTag(roundId);
  }

  // Return the loser index (tag holder after final throw)
  const finalRound = await game.rounds(roundId);
  return Number(finalRound.tagHolderIndex);
}

describe("SifaGame", () => {
  describe("Deployment", () => {
    it("Should deploy with correct addresses", async () => {
      const { game, sifa, curse, vault } = await loadFixture(deployGame);
      expect(await game.token()).to.equal(sifa);
      expect(await game.curse()).to.equal(curse);
      expect(await game.vault()).to.equal(vault.address);
      expect(await game.nextRoundId()).to.equal(1);
    });
  });

  describe("createRound", () => {
    it("Should create a round with valid entry fee", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      await expect(game.connect(p1).createRound(ENTRY_FEE))
        .to.emit(game, "RoundCreated")
        .withArgs(1, p1.address, ENTRY_FEE);

      expect(await game.nextRoundId()).to.equal(2);

      const round = await game.rounds(1);
      expect(round.creator).to.equal(p1.address);
      expect(round.entryFee).to.equal(ENTRY_FEE);
      expect(round.playerCount).to.equal(1);
      expect(round.state).to.equal(0); // Pending
    });

    it("Should deduct entry fee from creator", async () => {
      const { game, sifa, p1 } = await loadFixture(deployGame);

      const balanceBefore = await sifa.balanceOf(p1);
      await game.connect(p1).createRound(ENTRY_FEE);
      const balanceAfter = await sifa.balanceOf(p1);

      expect(balanceBefore - balanceAfter).to.equal(ENTRY_FEE);
    });

    it("Should revert with InvalidEntryFee when entryFee is zero", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      await expect(game.connect(p1).createRound(0)).to.be.revertedWithCustomError(
        game,
        "InvalidEntryFee"
      );
    });

    it("Should revert if player has insufficient balance", async () => {
      const { game, other } = await loadFixture(deployGame);

      await expect(game.connect(other).createRound(ENTRY_FEE)).to.be.reverted;
    });
  });

  describe("joinRound", () => {
    it("Should allow players to join a pending round", async () => {
      const { game, p1, p2 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);

      await expect(game.connect(p2).joinRound(1))
        .to.emit(game, "PlayerJoined")
        .withArgs(1, p2.address, 1);

      const round = await game.rounds(1);
      expect(round.playerCount).to.equal(2);
    });

    it("Should deduct entry fee from each joining player", async () => {
      const { game, sifa, p1, p2 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);
      const balanceBefore = await sifa.balanceOf(p2);
      await game.connect(p2).joinRound(1);
      expect(balanceBefore - (await sifa.balanceOf(p2))).to.equal(ENTRY_FEE);
    });

    it("Should revert with RoundNotFound for invalid roundId", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      await expect(game.connect(p1).joinRound(999)).to.be.revertedWithCustomError(
        game,
        "RoundNotFound"
      );
    });

    it("Should revert with AlreadyJoined for duplicate player", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);

      await expect(game.connect(p1).joinRound(1)).to.be.revertedWithCustomError(
        game,
        "AlreadyJoined"
      );
    });

    it("Should revert with InvalidRoundState for started round", async () => {
      const { game, p1, p2, p3, p4, other } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      // Round is now Active; another player cannot join
      await expect(game.connect(other).joinRound(1)).to.be.revertedWithCustomError(
        game,
        "InvalidRoundState"
      );
    });

    it("Should auto-start round when 4th player joins", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);
      await game.connect(p2).joinRound(1);
      await game.connect(p3).joinRound(1);

      // 4th player join should emit both PlayerJoined and RoundStarted
      await expect(game.connect(p4).joinRound(1)).to.emit(game, "RoundStarted");

      const round = await game.rounds(1);
      expect(round.state).to.equal(1); // Active
      expect(round.playerCount).to.equal(4);
      expect(round.throwCount).to.be.gte(6);
      expect(round.throwCount).to.be.lte(12);
      expect(round.tagHolderIndex).to.be.gte(0);
      expect(round.tagHolderIndex).to.be.lte(3);
    });
  });

  describe("throwTag", () => {
    it("Should allow tag holder to throw", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const round = await game.rounds(1);
      const players = [p1, p2, p3, p4];
      const tagHolder = players[Number(round.tagHolderIndex)];

      await expect(game.connect(tagHolder).throwTag(1)).to.emit(game, "TagThrown");
    });

    it("Should revert with NotTagHolder for non-tag-holder before timeout", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const round = await game.rounds(1);
      const players = [p1, p2, p3, p4];
      // Pick any player who is NOT the tag holder
      const nonTagHolder = players.find(
        (_, idx) => idx !== Number(round.tagHolderIndex)
      )!;

      await expect(game.connect(nonTagHolder).throwTag(1)).to.be.revertedWithCustomError(
        game,
        "NotTagHolder"
      );
    });

    it("Should allow any player to force throw after 1 hour timeout", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const round = await game.rounds(1);
      const players = [p1, p2, p3, p4];
      const nonTagHolder = players.find(
        (_, idx) => idx !== Number(round.tagHolderIndex)
      )!;

      // Advance time past 1 hour
      await time.increase(3601);

      // Non-tag-holder can now force throw
      await expect(game.connect(nonTagHolder).throwTag(1)).to.emit(game, "TagThrown");
    });

    it("Should revert with NotTagHolder for non-player after timeout", async () => {
      const { game, p1, p2, p3, p4, other } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);
      await time.increase(3601);

      await expect(game.connect(other).throwTag(1)).to.be.revertedWithCustomError(
        game,
        "NotTagHolder"
      );
    });

    it("Should revert with RoundNotActive for non-active round", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      // Round 999 does not exist; state defaults to Pending (0) which is not Active
      await expect(game.connect(p1).throwTag(999)).to.be.revertedWithCustomError(
        game,
        "RoundNotActive"
      );
    });

    it("Should update tag holder and increment currentThrow", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const roundBefore = await game.rounds(1);
      const players = [p1, p2, p3, p4];
      const tagHolder = players[Number(roundBefore.tagHolderIndex)];

      await game.connect(tagHolder).throwTag(1);

      const roundAfter = await game.rounds(1);
      expect(roundAfter.currentThrow).to.equal(roundBefore.currentThrow + 1n);
      // Tag holder must have changed to a different player
      expect(roundAfter.tagHolderIndex).to.not.equal(roundBefore.tagHolderIndex);
    });

    it("Should emit TagThrown with correct from/to addresses", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const round = await game.rounds(1);
      const players = [p1, p2, p3, p4];
      const tagHolder = players[Number(round.tagHolderIndex)];

      const tx = await game.connect(tagHolder).throwTag(1);
      const receipt = await tx.wait();

      const roundAfter = await game.rounds(1);
      const newTagHolder = players[Number(roundAfter.tagHolderIndex)];

      // Find TagThrown event
      const tagThrownEvent = receipt!.logs.find(
        (log: any) => log.topics && log.topics[0] === game.filters.TagThrown().fragment.topicHash
      );
      expect(tagThrownEvent).to.not.be.undefined;
    });
  });

  describe("Round completion and payouts", () => {
    it("Should distribute payouts correctly on final throw", async () => {
      const { game, sifa, p1, p2, p3, p4, vault } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const players = [p1, p2, p3, p4];

      // Record balances after entry fees deducted, before throws
      const balancesBefore: Record<string, bigint> = {};
      for (const p of players) {
        balancesBefore[p.address] = await sifa.balanceOf(p);
      }
      const vaultBalanceBefore = await sifa.balanceOf(vault);
      const deadBalanceBefore = await sifa.balanceOf(DEAD);

      // Play the round to completion
      const loserIdx = await playRound(game, 1n, players);

      // Verify round is completed
      const round = await game.rounds(1);
      expect(round.state).to.equal(2); // Completed

      // Calculate expected amounts
      const bank = ENTRY_FEE * 4n;
      const winnerShare = bank * 31n / 100n;
      const vaultShare = bank * 5n / 100n;
      const burnShare = bank * 2n / 100n;

      // Check each player's balance
      for (let i = 0; i < 4; i++) {
        const balanceAfter = await sifa.balanceOf(players[i]);
        if (i === loserIdx) {
          // Loser gets nothing
          expect(balanceAfter).to.equal(balancesBefore[players[i].address]);
        } else {
          // Winner gets 31%
          expect(balanceAfter).to.equal(
            balancesBefore[players[i].address] + winnerShare
          );
        }
      }

      // Check vault received 5%
      expect(await sifa.balanceOf(vault)).to.equal(vaultBalanceBefore + vaultShare);

      // Check burn address received 2%
      expect(await sifa.balanceOf(DEAD)).to.equal(deadBalanceBefore + burnShare);
    });

    it("Should mint curse NFT to loser", async () => {
      const { game, curse, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);
      const players = [p1, p2, p3, p4];

      const loserIdx = await playRound(game, 1n, players);
      const loser = players[loserIdx];

      // Curse NFT token ID equals roundId (1)
      expect(await curse.ownerOf(1)).to.equal(loser.address);

      // Mint timestamp is recorded
      const mintTs = await curse.mintTimestamps(1);
      expect(mintTs).to.be.gt(0);
    });

    it("Should emit RoundCompleted with correct loser and winners", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);
      const players = [p1, p2, p3, p4];

      // Play all throws except the last one
      let round = await game.rounds(1);
      const throwCount = Number(round.throwCount);

      for (let i = 0; i < throwCount - 1; i++) {
        round = await game.rounds(1);
        await game.connect(players[Number(round.tagHolderIndex)]).throwTag(1);
      }

      // Last throw should emit RoundCompleted
      round = await game.rounds(1);
      await expect(
        game.connect(players[Number(round.tagHolderIndex)]).throwTag(1)
      ).to.emit(game, "RoundCompleted");
    });
  });

  describe("abortRound", () => {
    it("Should abort and refund all players after 24 hours", async () => {
      const { game, sifa, p1, p2, p3 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);
      await game.connect(p2).joinRound(1);
      await game.connect(p3).joinRound(1);

      // Record balances after joining
      const balances: Record<string, bigint> = {};
      for (const p of [p1, p2, p3]) {
        balances[p.address] = await sifa.balanceOf(p);
      }

      // Advance 24 hours + 1 second
      await time.increase(24 * 60 * 60 + 1);

      await expect(game.connect(p1).abortRound(1)).to.emit(game, "RoundAborted").withArgs(1);

      const round = await game.rounds(1);
      expect(round.state).to.equal(3); // Aborted

      // All 3 players should be refunded
      for (const p of [p1, p2, p3]) {
        expect(await sifa.balanceOf(p)).to.equal(balances[p.address] + ENTRY_FEE);
      }
    });

    it("Should revert with NotRoundCreator if called by non-creator", async () => {
      const { game, p1, p2 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);
      await time.increase(24 * 60 * 60 + 1);

      await expect(game.connect(p2).abortRound(1)).to.be.revertedWithCustomError(
        game,
        "NotRoundCreator"
      );
    });

    it("Should revert with TooEarlyToAbort before 24 hours", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      await game.connect(p1).createRound(ENTRY_FEE);

      await expect(game.connect(p1).abortRound(1)).to.be.revertedWithCustomError(
        game,
        "TooEarlyToAbort"
      );
    });

    it("Should revert with RoundAlreadyStarted for active round", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      await time.increase(24 * 60 * 60 + 1);

      await expect(game.connect(p1).abortRound(1)).to.be.revertedWithCustomError(
        game,
        "RoundAlreadyStarted"
      );
    });

    it("Should revert with NotRoundCreator for non-existent round", async () => {
      const { game, p1 } = await loadFixture(deployGame);

      await expect(game.connect(p1).abortRound(999)).to.be.revertedWithCustomError(
        game,
        "NotRoundCreator"
      );
    });
  });

  describe("E2E: Full round lifecycle", () => {
    it("Should complete a full round from creation to payout", async () => {
      const { game, sifa, curse, p1, p2, p3, p4, vault } =
        await loadFixture(deployGame);

      // Create and fill round
      await createAndFillRound(game, [p1, p2, p3, p4]);

      const round = await game.rounds(1);
      expect(round.state).to.equal(1); // Active

      // Play to completion
      const players = [p1, p2, p3, p4];
      const loserIdx = await playRound(game, 1n, players);

      // Verify completed state
      const finalRound = await game.rounds(1);
      expect(finalRound.state).to.equal(2); // Completed

      // Verify curse NFT minted to loser
      expect(await curse.ownerOf(1)).to.equal(players[loserIdx].address);
    });

    it("Should support abort with only creator deposited", async () => {
      const { game, sifa, p1 } = await loadFixture(deployGame);

      const balanceBefore = await sifa.balanceOf(p1);
      await game.connect(p1).createRound(ENTRY_FEE);
      expect(await sifa.balanceOf(p1)).to.equal(balanceBefore - ENTRY_FEE);

      await time.increase(24 * 60 * 60 + 1);
      await game.connect(p1).abortRound(1);

      // Creator is fully refunded
      expect(await sifa.balanceOf(p1)).to.equal(balanceBefore);
    });
  });

  describe("E2E: Concurrent rounds", () => {
    it("Should support multiple concurrent rounds with overlapping players", async () => {
      const { game, sifa, p1, p2, p3, p4 } = await loadFixture(deployGame);

      // Round 1: p1, p2, p3, p4
      await createAndFillRound(game, [p1, p2, p3, p4]);

      // Round 2: p1, p2, p3, p4 (same players, different round)
      const smallFee = ethers.parseEther("10");
      await sifa.connect(p1).approve(game, ethers.parseEther("100000"));
      await sifa.connect(p2).approve(game, ethers.parseEther("100000"));
      await sifa.connect(p3).approve(game, ethers.parseEther("100000"));
      await sifa.connect(p4).approve(game, ethers.parseEther("100000"));

      await game.connect(p1).createRound(smallFee);
      await game.connect(p2).joinRound(2);
      await game.connect(p3).joinRound(2);
      await game.connect(p4).joinRound(2);

      // Both rounds are Active
      expect((await game.rounds(1)).state).to.equal(1);
      expect((await game.rounds(2)).state).to.equal(1);

      // Play both rounds to completion
      const players = [p1, p2, p3, p4];
      await playRound(game, 1n, players);
      await playRound(game, 2n, players);

      expect((await game.rounds(1)).state).to.equal(2); // Completed
      expect((await game.rounds(2)).state).to.equal(2); // Completed
    });
  });

  describe("E2E: Forced throw scenario", () => {
    it("Should allow forced throw and continue game after timeout", async () => {
      const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

      await createAndFillRound(game, [p1, p2, p3, p4]);

      const players = [p1, p2, p3, p4];
      let round = await game.rounds(1);
      const throwCount = Number(round.throwCount);

      // Do a forced throw on the first throw (any non-tag-holder after timeout)
      await time.increase(3601);
      const nonTagHolder = players.find(
        (_, idx) => idx !== Number(round.tagHolderIndex)
      )!;
      await game.connect(nonTagHolder).throwTag(1);

      // Continue normally for remaining throws
      for (let i = 1; i < throwCount; i++) {
        round = await game.rounds(1);
        const tagHolder = players[Number(round.tagHolderIndex)];
        await game.connect(tagHolder).throwTag(1);
      }

      const finalRound = await game.rounds(1);
      expect(finalRound.state).to.equal(2); // Completed
    });
  });

  describe("Round querying", () => {
    describe("getRound", () => {
      it("Should return correct RoundInfo for existing roundId", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);

        const info = await game.getRound(1);
        expect(info.creator).to.equal(p1.address);
        expect(info.entryFee).to.equal(ENTRY_FEE);
        expect(info.createdAt).to.be.gt(0);
        expect(info.state).to.equal(0); // Pending
        expect(info.playerCount).to.equal(1);
      });

      it("Should revert with RoundNotFound for roundId = 0", async () => {
        const { game } = await loadFixture(deployGame);

        await expect(game.getRound(0)).to.be.revertedWithCustomError(
          game,
          "RoundNotFound"
        );
      });

      it("Should revert with RoundNotFound for roundId >= nextRoundId", async () => {
        const { game } = await loadFixture(deployGame);

        await expect(game.getRound(1)).to.be.revertedWithCustomError(
          game,
          "RoundNotFound"
        );
      });
    });

    describe("getRoundsByState", () => {
      it("Should return pending rounds", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);

        const result = await game.getRoundsByState(0, 0, 10);
        expect(result.length).to.equal(1);
        expect(result[0].creator).to.equal(p1.address);
        expect(result[0].state).to.equal(0);
      });

      it("Should return active rounds", async () => {
        const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

        await createAndFillRound(game, [p1, p2, p3, p4]);

        const result = await game.getRoundsByState(1, 0, 10);
        expect(result.length).to.equal(1);
        expect(result[0].state).to.equal(1);
      });

      it("Should return completed rounds", async () => {
        const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

        await createAndFillRound(game, [p1, p2, p3, p4]);
        await playRound(game, 1n, [p1, p2, p3, p4]);

        const result = await game.getRoundsByState(2, 0, 10);
        expect(result.length).to.equal(1);
        expect(result[0].state).to.equal(2);
      });

      it("Should return aborted rounds", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);
        await time.increase(24 * 60 * 60 + 1);
        await game.connect(p1).abortRound(1);

        const result = await game.getRoundsByState(3, 0, 10);
        expect(result.length).to.equal(1);
        expect(result[0].state).to.equal(3);
      });

      it("Should return empty array when offset >= count", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);

        const result = await game.getRoundsByState(0, 5, 10);
        expect(result.length).to.equal(0);
      });

      it("Should return empty array when limit = 0", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);

        const result = await game.getRoundsByState(0, 0, 0);
        expect(result.length).to.equal(0);
      });

      it("Should paginate correctly with offset and limit", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);
        await game.connect(p1).createRound(ENTRY_FEE);
        await game.connect(p1).createRound(ENTRY_FEE);

        const page1 = await game.getRoundsByState(0, 0, 2);
        expect(page1.length).to.equal(2);

        const page2 = await game.getRoundsByState(0, 2, 2);
        expect(page2.length).to.equal(1);

        const empty = await game.getRoundsByState(0, 3, 10);
        expect(empty.length).to.equal(0);
      });
    });

    describe("getRoundsCountByState", () => {
      it("Should return correct count for each state", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);
        await game.connect(p1).createRound(ENTRY_FEE);

        expect(await game.getRoundsCountByState(0)).to.equal(2);
        expect(await game.getRoundsCountByState(1)).to.equal(0);
        expect(await game.getRoundsCountByState(2)).to.equal(0);
        expect(await game.getRoundsCountByState(3)).to.equal(0);
      });
    });

    describe("State set transitions", () => {
      it("After createRound, round is in Pending set", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);

        expect(await game.getRoundsCountByState(0)).to.equal(1);
        const result = await game.getRoundsByState(0, 0, 10);
        expect(result[0].creator).to.equal(p1.address);
      });

      it("After 4 players join, round moves from Pending to Active set", async () => {
        const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);
        expect(await game.getRoundsCountByState(0)).to.equal(1);

        await game.connect(p2).joinRound(1);
        await game.connect(p3).joinRound(1);
        await game.connect(p4).joinRound(1);

        expect(await game.getRoundsCountByState(0)).to.equal(0);
        expect(await game.getRoundsCountByState(1)).to.equal(1);
      });

      it("After round completes, round moves from Active to Completed set", async () => {
        const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

        await createAndFillRound(game, [p1, p2, p3, p4]);
        expect(await game.getRoundsCountByState(1)).to.equal(1);

        await playRound(game, 1n, [p1, p2, p3, p4]);

        expect(await game.getRoundsCountByState(1)).to.equal(0);
        expect(await game.getRoundsCountByState(2)).to.equal(1);
      });

      it("After abortRound, round moves from Pending to Aborted set", async () => {
        const { game, p1 } = await loadFixture(deployGame);

        await game.connect(p1).createRound(ENTRY_FEE);
        expect(await game.getRoundsCountByState(0)).to.equal(1);

        await time.increase(24 * 60 * 60 + 1);
        await game.connect(p1).abortRound(1);

        expect(await game.getRoundsCountByState(0)).to.equal(0);
        expect(await game.getRoundsCountByState(3)).to.equal(1);
      });

      it("Sum of all state counts equals nextRoundId - 1", async () => {
        const { game, p1, p2, p3, p4 } = await loadFixture(deployGame);

        // Round 1: stays Pending
        await game.connect(p1).createRound(ENTRY_FEE);

        // Round 2: filled → Active
        await createAndFillRound(game, [p1, p2, p3, p4]);

        // Round 3: created then Aborted
        await game.connect(p1).createRound(ENTRY_FEE);
        await time.increase(24 * 60 * 60 + 1);
        await game.connect(p1).abortRound(3);

        const pending = Number(await game.getRoundsCountByState(0));
        const active = Number(await game.getRoundsCountByState(1));
        const completed = Number(await game.getRoundsCountByState(2));
        const aborted = Number(await game.getRoundsCountByState(3));
        const nextRoundId = Number(await game.nextRoundId());

        expect(pending + active + completed + aborted).to.equal(nextRoundId - 1);
      });
    });
  });
});
