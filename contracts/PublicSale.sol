// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IEmitter} from "./Emitter.sol";
import {IVestingVault} from "./VestingVault.sol";

contract PublicSale is Ownable {
    using Math for uint256;

    event Sold(uint256 amount, address to);
    event Finalized();

    ERC20 public immutable token;
    IEmitter public immutable emitter;
    IVestingVault public immutable vesting;
    IUniswapV3Factory public immutable factory;

    uint256 public immutable price;
    uint256 public immutable minSale;
    uint256 public immutable maxSale;
    uint64 public immutable vestingCliff;
    uint64 public immutable vestingDuraion;
    uint8 private immutable _underlyingDecimals;
    uint256 public sold;
    IUniswapV3Pool public pool;
    bool public finalized;

    uint64 private immutable _start;
    uint64 private immutable _duration;
    mapping(address => uint256) private _balances;
    mapping(address => bool) private _buyerExists;
    address[] private _buyers;

    constructor(
        address initialOwner_,
        address token_,
        address emitter_,
        address vesting_,
        address factory_,
        uint256 price_,
        uint256 minSale_,
        uint256 maxSale_,
        uint64 start_,
        uint64 duration_,
        uint64 vestingCliff_,
        uint64 vestingDuraion_
    ) Ownable(initialOwner_) {
        token = ERC20(token_);
        emitter = IEmitter(emitter_);
        vesting = IVestingVault(vesting_);
        factory = IUniswapV3Factory(factory_);
        price = price_;
        minSale = minSale_;
        maxSale = maxSale_;
        _start = start_;
        _duration = duration_;
        vestingCliff = vestingCliff_;
        vestingDuraion = vestingDuraion_;
        _underlyingDecimals = token.decimals();
    }

    /**
     * Receive ETH and perform the sale
     */
    receive() external payable {
        require(block.timestamp >= start(), "Sale not started");
        require(block.timestamp <= end(), "Sale ended");
        uint256 amount = tokensPerEth(msg.value);
        require(amount >= minSale, "Less than min");
        require(amount <= maxSale, "More than max");
        _sale(msg.sender, amount);
    }

    function balanceOf(address buyer) public view returns (uint256) {
        return _balances[buyer];
    }

    function buyerExists(address buyer) public view returns (bool) {
        return _buyerExists[buyer];
    }

    function start() public view returns (uint64) {
        return _start;
    }

    function duration() public view returns (uint64) {
        return _duration;
    }

    function end() public view returns (uint64) {
        return start() + duration();
    }

    function hardcap() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function tokensPerEth(uint256 eth) public view returns (uint256) {
        return (eth * (10 ** _underlyingDecimals)) / price;
    }

    function ethPerTokens(uint256 tokens) public view returns (uint256) {
        return (tokens * price) / (10 ** _underlyingDecimals);
    }

    function finalize() external onlyOwner {
        require(finalized == false, "Already finalized");
        require(block.timestamp > end(), "Sale not ended");
        _vestAll();
        _dex();
        _emit();

        // Send remaining ETH to owner
        payable(owner()).transfer(address(this).balance);

        finalized = true;
        emit Finalized();
    }

    function _sale(address to, uint256 amount) private returns (bool) {
        _balances[to] += amount;
        sold += amount;
        require(_balances[to] <= maxSale, "Total more then max");
        require(sold <= hardcap(), "Exceeds hardcap");
        if (!_buyerExists[to]) {
            _buyerExists[to] = true;
            _buyers.push(to);
        }
        emit Sold(amount, to);
        return true;
    }

    function _vestAll() private {
        token.approve(address(vesting), sold);
        for (uint i = 0; i < _buyers.length; i++) {
            vesting.vest(
                address(_buyers[i]),
                _balances[_buyers[i]],
                vestingCliff,
                vestingDuraion
            );
        }
    }

    function _emit() private {
        token.approve(address(emitter), token.balanceOf(address(this)));
        emitter.fill(token.balanceOf(address(this)));
    }

    function _dex() private {}
}
