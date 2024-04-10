// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, ERC20} from "./SifaToken.sol";

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256 _amount) external;
}

contract SifaPublicSale is Ownable {
    error ESaleIsNotActive();
    error ETokensAreLocked();
	error ESaleIsNotFinished();

	event Sold(address to, uint256 value);
    event Withdrawn(address to, uint256 value);

    mapping(address account => uint256) private _balances;

	address public weth = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public dexPairAddress;
    address public vaultAddress;
    address public sifaToken;

    uint256 public price = 5 * 10 ** 11;
    uint256 public minSaleSifa = 20000 * 10 ** 18;
    uint256 public maxSaleSifa = 2000000 * 10 ** 18;
    uint256 public totalSifaToSale = 220000000 * 10 ** 18;
    uint256 public totalSifaToDex = 110000000 * 10 ** 18;

    uint256 public saleStart = 1713139200; // April 15 2024
    uint256 public saleEnd = saleStart + 86400 * 14; // +2 weeks
    uint256 public unlockTime = saleEnd + 86400 * 1; // Tokens unlocked after 1 day

    modifier activeSale() {
        if (block.timestamp < saleStart || block.timestamp > saleEnd) {
            revert ESaleIsNotActive();
        }
        _;
    }

	modifier finishedSale() {
		if (block.timestamp < saleEnd) {
			revert ESaleIsNotFinished();
		}
		_;
	}

    modifier tokensUnlocked() {
        if (block.timestamp < unlockTime) {
            revert ETokensAreLocked();
        }
        _;
    }

    receive() external payable {
        uint256 toSell = msg.value * price;
		_sale(msg.sender, toSell);
    }

	function _sale(address to, uint256 value) private activeSale {
		require(value >= minSaleSifa, "Less than min sale");
        require(
            _balances[to] + value <= maxSaleSifa,
            "Exceeds max sale"
        );
        _balances[to] += value;
		emit Sold(to, value);
	}

    function withdraw() public virtual tokensUnlocked {
        uint256 value = _balances[msg.sender];
        require(value > 0, "Nothing to withdraw");
        ERC20(sifaToken).transferFrom(address(this), msg.sender, value);
        _balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, value);
    }

	function finish() public virtual onlyOwner finishedSale {
		uint256 raisedEther = address(this).balance;
		uint256 etherToPool = raisedEther / 2;
		uint256 etherToOwner = raisedEther - etherToPool;

		// Exchange ETH to WETH.
		(bool sentWeth, ) = weth.call{ value: etherToPool }("");
		require(sentWeth, "Fail WETH convert");

		// Feed the dex pair with liquidity.
		// Send unsold SIFA to the vault.

		// Send remaining ETH to the owner.
		(bool sentEthOwner, ) = owner().call{ value: etherToOwner }("");
		require(sentEthOwner, "Fail ETH to owner");
	}

    constructor(
        address initialOwner,
        address sifa,
        address vault,
        address dex
    ) Ownable(initialOwner) {
        sifaToken = sifa;
        vaultAddress = vault;
        dexPairAddress = dex;
    }
}
