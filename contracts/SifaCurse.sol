// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISifaCurse} from "./interfaces/ISifaCurse.sol";

contract SifaCurse is ISifaCurse, ERC721, Ownable {
    address public gameContract;
    mapping(uint256 => uint256) public mintTimestamps;

    constructor(address initialOwner_) ERC721("SifaCurse", "CURSE") Ownable(initialOwner_) {}

    /// @dev Set the game contract address. Only the owner may call this.
    /// @param gameContract_ The address of the SifaGame contract
    function setGameContract(address gameContract_) external onlyOwner {
        gameContract = gameContract_;
    }

    /// @dev Mint a curse NFT to the loser of a round. Only callable by the game contract.
    /// @param recipient The address of the loser
    /// @param roundId The round ID that caused the curse; used as the token ID
    function mint(address recipient, uint256 roundId) external override {
        if (msg.sender != gameContract) revert CurseNotMinter(msg.sender);
        mintTimestamps[roundId] = block.timestamp;
        _mint(recipient, roundId);
        emit CurseMinted(roundId, recipient, roundId);
    }

    /// @dev Override transferFrom to enforce the 30-day transfer lock after minting.
    /// @param from The current owner of the token
    /// @param to The recipient address
    /// @param tokenId The token being transferred
    function transferFrom(address from, address to, uint256 tokenId) public override {
        uint256 unlockTime = mintTimestamps[tokenId] + 30 days;
        if (block.timestamp < unlockTime) revert CurseTransferLocked(tokenId, unlockTime);
        super.transferFrom(from, to, tokenId);
    }
}
