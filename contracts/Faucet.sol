// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Faucet for the Sifa Game
 */
contract Faucet is Context {
    address public TOKEN;
    uint256 public DROP_AMOUNT = 10 * 10 ** 18;
    uint256 public DELAY = 1 days;
    mapping(address => uint256) private _availableAt;

    event Dropped(uint256 amount);

    modifier canDrop() {
        require(available(), "Wait");
        _;
    }

    constructor(address token_, uint256 dropAmount_, uint256 delay_) {
        TOKEN = token_;
        DROP_AMOUNT = dropAmount_;
        DELAY = delay_;
    }

    function available() public view returns (bool) {
        uint256 at = _availableAt[_msgSender()];
        return at == 0 || at < block.timestamp;
    }

    function drop() public canDrop {
        _availableAt[_msgSender()] = block.timestamp + DELAY;
        IERC20(TOKEN).transfer(_msgSender(), DROP_AMOUNT);
        emit Dropped(DROP_AMOUNT);
    }
}
