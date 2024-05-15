// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    event Deposited(address from, uint256 amount, uint256 shares);
    event Withdrawn(address to, uint256 amount, uint256 shares);

    IERC20 public immutable token;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function _mint(address _to, uint256 _shares) private {
        totalSupply += _shares;
        balanceOf[_to] += _shares;
    }

    function _burn(address _from, uint256 _shares) private {
        totalSupply -= _shares;
        balanceOf[_from] -= _shares;
    }

    function _tokensForShares(uint256 _shares) internal view returns (uint256) {
        return (_shares * token.balanceOf(address(this))) / totalSupply;
    }

    function rewards() external view returns (uint256) {
        return _tokensForShares(balanceOf[msg.sender]);
    }

    function deposit(uint256 _amount) external nonReentrant {
        uint256 shares;
        if (totalSupply == 0) {
            shares = _amount;
        } else {
            shares = (_amount * totalSupply) / token.balanceOf(address(this));
        }
        _mint(msg.sender, shares);
        token.transferFrom(msg.sender, address(this), _amount);
        emit Deposited(msg.sender, _amount, shares);
    }

    function withdraw(uint256 _shares) external nonReentrant {
        uint256 amount = (_shares * token.balanceOf(address(this))) /
            totalSupply;
        _burn(msg.sender, _shares);
        token.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, _shares);
    }
}
