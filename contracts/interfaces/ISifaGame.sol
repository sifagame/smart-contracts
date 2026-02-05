// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

interface ISifaGame {
    enum RoundState { Pending, Active, Completed, Aborted }

    struct Round {
        address creator;
        uint256 entryFee;
        uint256 createdAt;
        uint256 lastThrowTimestamp;
        address[4] players;
        uint8 playerCount;
        uint8 tagHolderIndex;
        uint8 throwCount;
        uint8 currentThrow;
        RoundState state;
    }

    struct RoundInfo {
        address creator;
        uint256 entryFee;
        uint256 createdAt;
        RoundState state;
        uint8 playerCount;
    }

    event RoundCreated(uint256 indexed roundId, address indexed creator, uint256 entryFee);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 playerIndex);
    event RoundStarted(uint256 indexed roundId, uint8 throwCount, uint8 initialTagHolder);
    event TagThrown(uint256 indexed roundId, address indexed from, address indexed to, uint8 throwNumber);
    event RoundCompleted(uint256 indexed roundId, address indexed loser, address[3] winners);
    event RoundAborted(uint256 indexed roundId);

    error InvalidEntryFee();
    error RoundNotFound();
    error RoundFull();
    error AlreadyJoined();
    error InvalidRoundState();
    error NotTagHolder();
    error RoundNotActive();
    error NotRoundCreator();
    error TooEarlyToAbort();
    error RoundAlreadyStarted();

    /// @dev Create a new round with the specified entry fee
    /// @param entryFee The entry fee in SIFA tokens; must be greater than zero
    /// @return roundId The unique identifier of the created round
    function createRound(uint256 entryFee) external returns (uint256);

    /// @dev Join an existing pending round
    /// @param roundId The identifier of the round to join
    function joinRound(uint256 roundId) external;

    /// @dev Throw the tag to a random other player in the round
    /// @param roundId The identifier of the round
    function throwTag(uint256 roundId) external;

    /// @dev Abort a pending round after 24 hours, refunding all deposited players
    /// @param roundId The identifier of the round to abort
    function abortRound(uint256 roundId) external;

    /// @dev Get round information by its unique identifier
    /// @param roundId The unique identifier of the round
    /// @return Round information as a RoundInfo struct
    function getRound(uint256 roundId) external view returns (RoundInfo memory);

    /// @dev Get rounds filtered by state with pagination
    /// @param state The round state to filter by
    /// @param offset Zero-based index to start reading from
    /// @param limit Maximum number of rounds to return
    /// @return Array of RoundInfo structs matching the specified state
    function getRoundsByState(RoundState state, uint256 offset, uint256 limit) external view returns (RoundInfo[] memory);

    /// @dev Get the total number of rounds in a given state
    /// @param state The round state to count
    /// @return The number of rounds in the specified state
    function getRoundsCountByState(RoundState state) external view returns (uint256);
}
