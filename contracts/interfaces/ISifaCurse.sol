// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

interface ISifaCurse {
    error CurseNotMinter(address caller);
    error CurseTransferLocked(uint256 tokenId, uint256 unlockTime);

    event CurseMinted(uint256 indexed tokenId, address indexed recipient, uint256 indexed roundId);

    /// @dev Mint a curse NFT to the loser of a round
    /// @param recipient The address of the loser
    /// @param roundId The round ID that caused the curse; also used as the token ID
    function mint(address recipient, uint256 roundId) external;

    /// @dev Get the mint timestamp of a curse NFT
    /// @param tokenId The token ID to query
    /// @return The block timestamp when the token was minted
    function mintTimestamps(uint256 tokenId) external view returns (uint256);
}
