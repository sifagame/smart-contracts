// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEmitter} from "./Emitter.sol";

interface IVault is IERC4626 {
    function updateEmitter(address _emitter) external;
}

contract Vault is Ownable, ERC4626 {
    event EmitterUpdated(address emitter);

    IEmitter public emitter;

    constructor(
        IERC20 token_,
        address initialOwner_
    ) ERC4626(token_) ERC20("Sifa Vault", "vSIFA") Ownable(initialOwner_) {}

    function updateEmitter(address _emitter) external onlyOwner {
        emitter = IEmitter(_emitter);
        emit EmitterUpdated(_emitter);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        uint256 assetsWithdrawn = super.withdraw(assets, receiver, owner);
        _maybeWithdrawEmitter();
        return assetsWithdrawn;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        _maybeWithdrawEmitter();
        return super.redeem(shares, receiver, owner);
    }

    function _maybeWithdrawEmitter() internal {
        if (address(0) != address(emitter)) {
            if (emitter.available() > 0) {
                emitter.withdraw();
            }
        }
    }
}
