// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISifaGame} from "./interfaces/ISifaGame.sol";
import {ISifaCurse} from "./interfaces/ISifaCurse.sol";

contract SifaGame is ISifaGame, ReentrancyGuard {
    IERC20 public immutable token;
    ISifaCurse public immutable curse;
    address public immutable vault;

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    mapping(uint256 => Round) public rounds;
    uint256 public nextRoundId = 1;
    uint256 private nonce;

    constructor(address token_, address curse_, address vault_) {
        token = IERC20(token_);
        curse = ISifaCurse(curse_);
        vault = vault_;
    }

    /// @dev Generate a pseudo-random number using block entropy
    /// @param roundId Additional entropy source
    /// @return A pseudo-random uint256
    function _random(uint256 roundId) internal returns (uint256) {
        nonce++;
        return uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, roundId, nonce)));
    }

    /// @dev Create a new round with the specified entry fee
    /// @param entryFee The entry fee in SIFA tokens; must be greater than zero
    /// @return The unique identifier of the created round
    function createRound(uint256 entryFee) external nonReentrant returns (uint256) {
        if (entryFee == 0) revert InvalidEntryFee();

        uint256 roundId = nextRoundId++;
        Round storage round = rounds[roundId];
        round.creator = msg.sender;
        round.entryFee = entryFee;
        round.createdAt = block.timestamp;
        round.players[0] = msg.sender;
        round.playerCount = 1;
        round.state = RoundState.Pending;

        token.transferFrom(msg.sender, address(this), entryFee);

        emit RoundCreated(roundId, msg.sender, entryFee);
        return roundId;
    }

    /// @dev Join an existing pending round
    /// @param roundId The identifier of the round to join
    function joinRound(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];

        if (round.creator == address(0)) revert RoundNotFound();
        if (round.state != RoundState.Pending) revert InvalidRoundState();
        if (round.playerCount >= 4) revert RoundFull();

        for (uint8 i = 0; i < round.playerCount; i++) {
            if (round.players[i] == msg.sender) revert AlreadyJoined();
        }

        uint8 playerIndex = round.playerCount;
        round.players[playerIndex] = msg.sender;
        round.playerCount++;

        token.transferFrom(msg.sender, address(this), round.entryFee);

        emit PlayerJoined(roundId, msg.sender, playerIndex);

        if (round.playerCount == 4) {
            _startRound(roundId);
        }
    }

    /// @dev Start a round after the 4th player joins
    /// @param roundId The round to start
    function _startRound(uint256 roundId) internal {
        Round storage round = rounds[roundId];
        round.state = RoundState.Active;
        round.throwCount = uint8(6 + _random(roundId) % 7);
        round.tagHolderIndex = uint8(_random(roundId) % 4);
        round.lastThrowTimestamp = block.timestamp;

        emit RoundStarted(roundId, round.throwCount, round.tagHolderIndex);
    }

    /// @dev Throw the tag to a random other player in the round
    /// @param roundId The identifier of the round
    function throwTag(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];

        if (round.state != RoundState.Active) revert RoundNotActive();

        bool isTagHolder = round.players[round.tagHolderIndex] == msg.sender;
        bool isTimedOut = block.timestamp >= round.lastThrowTimestamp + 1 hours;

        if (!isTagHolder) {
            if (!isTimedOut) revert NotTagHolder();
            bool isPlayer = false;
            for (uint8 i = 0; i < 4; i++) {
                if (round.players[i] == msg.sender) {
                    isPlayer = true;
                    break;
                }
            }
            if (!isPlayer) revert NotTagHolder();
        }

        address from = round.players[round.tagHolderIndex];

        uint256 rand = _random(roundId) % 3;
        uint8 newTagHolderIndex = uint8((round.tagHolderIndex + 1 + rand) % 4);

        round.tagHolderIndex = newTagHolderIndex;
        round.currentThrow++;
        round.lastThrowTimestamp = block.timestamp;

        address to = round.players[newTagHolderIndex];

        emit TagThrown(roundId, from, to, round.currentThrow);

        if (round.currentThrow == round.throwCount) {
            _completeRound(roundId);
        }
    }

    /// @dev Distribute winnings and mint curse NFT after the final throw
    /// @param roundId The completed round
    function _completeRound(uint256 roundId) internal {
        Round storage round = rounds[roundId];
        round.state = RoundState.Completed;

        address loser = round.players[round.tagHolderIndex];
        address[3] memory winners;
        uint8 winnerIdx = 0;
        for (uint8 i = 0; i < 4; i++) {
            if (i != round.tagHolderIndex) {
                winners[winnerIdx++] = round.players[i];
            }
        }

        uint256 bank = round.entryFee * 4;
        uint256 winnerShare = bank * 31 / 100;
        uint256 vaultShare = bank * 5 / 100;
        uint256 burnShare = bank * 2 / 100;

        for (uint8 i = 0; i < 3; i++) {
            token.transfer(winners[i], winnerShare);
        }
        token.transfer(vault, vaultShare);
        token.transfer(DEAD, burnShare);

        curse.mint(loser, roundId);

        emit RoundCompleted(roundId, loser, winners);
    }

    /// @dev Abort a pending round after 24 hours, refunding all deposited players
    /// @param roundId The identifier of the round to abort
    function abortRound(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];

        if (msg.sender != round.creator) revert NotRoundCreator();
        if (block.timestamp < round.createdAt + 24 hours) revert TooEarlyToAbort();
        if (round.state != RoundState.Pending) revert RoundAlreadyStarted();

        round.state = RoundState.Aborted;

        for (uint8 i = 0; i < round.playerCount; i++) {
            token.transfer(round.players[i], round.entryFee);
        }

        emit RoundAborted(roundId);
    }
}
