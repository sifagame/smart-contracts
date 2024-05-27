// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEmitter} from "./Emitter.sol";

import "hardhat/console.sol";

contract Vault is Ownable, ERC4626 {
    event EmitterUpdated(address emitter);
    event RedeemRequested(uint256 shares, address owner, uint256 availableAt);

    struct RedeemRequest {
        uint256 availableAt;
        uint256 shares;
    }

    uint256 constant REDEEM_DELAY = 14 days;
    address public emitter;
    mapping(address owner => RedeemRequest) public redeemRequests;

    modifier canRedeem(uint256 shares, address owner) {
        require(
            redeemRequests[owner].shares >= shares,
            "Redeem amount exceed available"
        );
        require(
            redeemRequests[owner].availableAt <= block.timestamp,
            "Redeem not available yet"
        );
        _;
    }

    constructor(
        IERC20 token_,
        address initialOwner_
    ) ERC4626(token_) ERC20("Sifa Vault", "vSIFA") Ownable(initialOwner_) {}

    function updateEmitter(address _emitter) external onlyOwner {
        emitter = _emitter;
        emit EmitterUpdated(_emitter);
    }

    function withdraw(
        uint256,
        address,
        address
    ) public virtual override returns (uint256) {
        revert("Use redeem()");
    }

    function requestRedeem(
        uint256 shares,
        address owner
    ) public virtual returns (RedeemRequest memory) {
        require(shares <= maxRedeem(owner), "Exceeds max redeem");
        if (_msgSender() != owner) {
            require(
                shares <= allowance(owner, _msgSender()),
                "Not enough allowance"
            );
        }

        uint256 newTime = block.timestamp + REDEEM_DELAY;

        redeemRequests[owner].availableAt = newTime;
        redeemRequests[owner].shares = shares;

        emit RedeemRequested(shares, owner, newTime);
        return redeemRequests[owner];
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override canRedeem(shares, owner) returns (uint256) {
        if (address(0) != emitter) {
            if (IEmitter(emitter).available() > 0) {
                IEmitter(emitter).withdraw();
            }
        }
		redeemRequests[owner].shares -= shares;
        return super.redeem(shares, receiver, owner);
    }
}
