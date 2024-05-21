// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IWETH} from "@uniswap/swap-router-contracts/contracts/interfaces/IWETH.sol";
import {IEmitter} from "./Emitter.sol";
import {IVestingVault} from "./VestingVault.sol";

contract PublicSale is Ownable {
    using Math for uint256;

    event Sold(uint256 amount, address to);
    event Finalized();

    struct Contracts {
        address token;
        address emitter;
        address vesting;
        address factory;
        address pool;
        address weth;
    }

    struct PriceSettings {
        uint256 price;
        uint256 minSale;
        uint256 maxSale;
    }

    struct DateSettings {
        uint64 start;
        uint64 duration;
        uint64 vestingCliff;
        uint64 vestingDuration;
    }

    Contracts private _contracts;
    PriceSettings private _priceSettings;
    DateSettings private _dateSettings;

    uint8 private immutable _underlyingDecimals;

    uint256 public sold;
    bool public finalized;

    mapping(address => uint256) private _balances;
    mapping(address => bool) private _buyerExists;
    address[] private _buyers;

    constructor(
        address initialOwner_,
        Contracts memory contracts_,
        PriceSettings memory priceSettings_,
        DateSettings memory dateSettings_
    ) Ownable(initialOwner_) {
        _contracts = contracts_;
        _priceSettings = priceSettings_;
        _dateSettings = dateSettings_;
        _underlyingDecimals = ERC20(_contracts.token).decimals();
    }

    function token() public view returns (address) {
        return _contracts.token;
    }

    function emitter() public view returns (address) {
        return _contracts.emitter;
    }

    function vesting() public view returns (address) {
        return _contracts.vesting;
    }

    function factory() public view returns (address) {
        return _contracts.factory;
    }

    function pool() public view returns (address) {
        return _contracts.pool;
    }

    function weth() public view returns (address) {
        return _contracts.weth;
    }

    function start() public view returns (uint64) {
        return _dateSettings.start;
    }

    function duration() public view returns (uint64) {
        return _dateSettings.duration;
    }

    function end() public view returns (uint64) {
        return start() + duration();
    }

    function vestingCliff() public view returns (uint64) {
        return _dateSettings.vestingCliff;
    }

    function vestingDuration() public view returns (uint64) {
        return _dateSettings.vestingDuration;
    }

    function price() public view returns (uint256) {
        return _priceSettings.price;
    }

    function minSale() public view returns (uint256) {
        return _priceSettings.minSale;
    }

    function maxSale() public view returns (uint256) {
        return _priceSettings.maxSale;
    }

    function balanceOf(address buyer) public view returns (uint256) {
        return _balances[buyer];
    }

    function buyerExists(address buyer) public view returns (bool) {
        return _buyerExists[buyer];
    }

    function hardcap() public view returns (uint256) {
        return ERC20(_contracts.token).balanceOf(address(this));
    }

    function tokensPerEth(uint256 eth) public view returns (uint256) {
        return (eth * (10 ** _underlyingDecimals)) / price();
    }

    function ethPerTokens(uint256 tokens) public view returns (uint256) {
        return (tokens * price()) / (10 ** _underlyingDecimals);
    }

    /**
     * Receive ETH and perform the sale
     */
    receive() external payable {
        require(block.timestamp >= start(), "Sale not started");
        require(block.timestamp <= end(), "Sale ended");
        uint256 amount = tokensPerEth(msg.value);
        require(amount >= minSale(), "Less than min");
        require(amount <= maxSale(), "More than max");
        _sale(msg.sender, amount);
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
        require(_balances[to] <= maxSale(), "Total more then max");
        require(sold <= hardcap(), "Exceeds hardcap");
        if (!_buyerExists[to]) {
            _buyerExists[to] = true;
            _buyers.push(to);
        }
        emit Sold(amount, to);
        return true;
    }

    function _vestAll() private {
        ERC20(token()).approve(vesting(), sold);
        for (uint i = 0; i < _buyers.length; i++) {
            IVestingVault(_contracts.vesting).vest(
                address(_buyers[i]),
                _balances[_buyers[i]],
                vestingCliff(),
                vestingDuration()
            );
        }
    }

    function _emit() private {
        uint256 balance = ERC20(token()).balanceOf(address(this));
        ERC20(token()).approve(emitter(), balance);
        IEmitter(emitter()).fill(balance);
    }

    function _dex() private {}
}
