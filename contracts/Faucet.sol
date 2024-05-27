// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Faucet for the Sifa Game
 */
contract Faucet is Context {
    address public immutable TOKEN;
    uint256 public immutable DROP_AMOUNT = 10 * 10 ** 18;
    uint256 public immutable DELAY = 1 days;
    uint256 constant REQUIRE_ETH = 10 ** 15;
    mapping(address => uint256) private _availableAt;

    event Dropped(uint256 amount);

    modifier canDrop(address to) {
        require(available(to), "Wait");
        _;
    }

    modifier hasEth(address to) {
        require(to.balance >= REQUIRE_ETH, "Own more 0.001 ETH");
        _;
    }

    constructor(address token_, uint256 dropAmount_, uint256 delay_) {
        TOKEN = token_;
        DROP_AMOUNT = dropAmount_;
        DELAY = delay_;
    }

    function available(address to) public view returns (bool) {
        uint256 at = _availableAt[to];
        return at == 0 || at < block.timestamp;
    }

    function drop(address to) public canDrop(to) hasEth(to) {
        _availableAt[to] = block.timestamp + DELAY;
        IERC20(TOKEN).transfer(to, DROP_AMOUNT);
        emit Dropped(DROP_AMOUNT);
    }
}
