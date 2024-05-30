// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEmitter} from "./Emitter.sol";

contract Vault is Ownable, ERC4626 {
    event EmitterUpdated(address emitter);

    address public emitter;

    constructor(
        IERC20 token_,
        address initialOwner_
    ) ERC4626(token_) ERC20("Sifa Vault", "vSIFA") Ownable(initialOwner_) {}

    function updateEmitter(address _emitter) external onlyOwner {
        emitter = _emitter;
        emit EmitterUpdated(_emitter);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
		uint256 assetsWithdrawn = super.withdraw(assets, receiver, owner);
        if (address(0) != emitter) {
            if (IEmitter(emitter).available() > 0) {
                IEmitter(emitter).withdraw();
            }
        }
        return assetsWithdrawn;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        if (address(0) != emitter) {
            if (IEmitter(emitter).available() > 0) {
                IEmitter(emitter).withdraw();
            }
        }
        return super.redeem(shares, receiver, owner);
    }
}
