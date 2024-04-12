// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./SifaToken.sol";

contract RewardsLock {
    IERC20 public immutable token;
    address public immutable vault;
    uint256 public immutable releaseRate;
    uint256 public start;
    uint256 public unlocked;
    uint256 public locked;

    constructor(address _token, address _vault) {
        token = IERC20(_token);
        vault = _vault;
        releaseRate = 5 * 10 ** 18;
    }

    function deposit(uint256 _amount) external {
        if (0 == start) {
            start = block.timestamp;
        }
        locked += _amount;
        token.transferFrom(msg.sender, address(this), _amount);
    }

    function available() external view returns (uint256) {
        return _available();
    }

    function _available() internal view returns (uint256) {
        uint256 newUnlocked = (block.timestamp - start) * releaseRate;
        uint256 amount = newUnlocked - unlocked;
        return locked > amount ? amount : locked;
    }

    function withdraw() external returns (bool) {
        require(start != 0, "Lock isn't started");
        uint256 amount = _available();
        require(amount > 0, "Nothing to unlock");
        token.transfer(vault, amount);
        unlocked += amount;
        locked -= amount;
        return true;
    }
}
