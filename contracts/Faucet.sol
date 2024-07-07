// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Faucet for the Sifa Game
 */
contract Faucet is Context {
	event Dropped(uint256 amount, address to);
    error FaucetClaimNotAvailable(address to);
    error FaucetNotEnoughETH(address to);
    error FaucetHasNotEnoughTokens(uint256 remain);

    address public immutable TOKEN;
    uint256 public immutable DROP_AMOUNT = 10 * 10 ** 18;
    uint256 public immutable DELAY = 1 days;
    uint256 public constant REQUIRE_ETH = 10 ** 15;
    mapping(address => uint256) private _availableAt;

    modifier canDrop(address to) {
        if (!available(to)) revert FaucetClaimNotAvailable(to);
        _;
    }

    modifier hasEth(address to) {
        if (to.balance < REQUIRE_ETH) revert FaucetNotEnoughETH(to);
        _;
    }

    modifier hasTokens() {
        uint256 remain = IERC20(TOKEN).balanceOf(address(this));
        if (remain < DROP_AMOUNT) revert FaucetHasNotEnoughTokens(remain);
        _;
    }

    constructor(address token_, uint256 dropAmount_, uint256 delay_) {
        TOKEN = token_;
        DROP_AMOUNT = dropAmount_;
        DELAY = delay_;
    }

    function available(address to) public view returns (bool) {
        return nextClaimAt(to) <= block.timestamp;
    }

    function nextClaimAt(address to) public view returns (uint256) {
        return _availableAt[to];
    }

    function claim() public {
        return drop(_msgSender());
    }

    function drop(address to) public canDrop(to) hasEth(to) hasTokens {
        _availableAt[to] = block.timestamp + DELAY;
        IERC20(TOKEN).transfer(to, DROP_AMOUNT);
        emit Dropped(DROP_AMOUNT, to);
    }
}
