// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, IERC20} from "./SifaToken.sol";

interface IWETH9 {
    function deposit() external payable;

    function withdraw(uint256 _amount) external;
}

contract PublicSale is Ownable {
    error ESaleIsNotActive();
    error ETokensAreLocked();
    error ESaleIsNotFinished();

    event Sold(address to, uint256 value);
    event Withdrawn(address to, uint256 value);

    mapping(address account => uint256) private _balances;

    address public immutable unsoldContract;
    IERC20 public immutable token;

    uint256 public immutable tokensPerEth = 2000000;
    uint256 public immutable minSale = 20000;
    uint256 public immutable maxSale = 2000000;
    uint256 public saleAmount;
    uint256 public immutable percentToDex = 50;

    uint256 public immutable saleStart;
    uint256 public immutable saleEnd;
    uint256 public immutable unlockAt;

    /**
     * Deploy the contract
     * @param _initialOwner Owner of the contract
     * @param _token Token to sale
     * @param _unsold Rewards Lock contract to send unsold tokens
     * @param _start Sale start time
     * @param _end Sale end time
     * @param _unlock Tokens unlock time
     */
    constructor(
        address _initialOwner,
        address _token,
        address _unsold,
        uint256 _start,
        uint256 _end,
        uint256 _unlock
    ) Ownable(_initialOwner) {
        token = IERC20(_token);
        unsoldContract = _unsold;
        require(_start >= block.timestamp, "Start in the past");
        require(_start < _end, "End before start");
        require(_end < _unlock, "Unlock before end");
        saleStart = _start;
        saleEnd = _end;
        unlockAt = _unlock;
    }

    /**
     * Whether the sale is active (timestamp is between start and end time)
     */
    modifier activeSale() {
        if (block.timestamp < saleStart || block.timestamp > saleEnd) {
            revert ESaleIsNotActive();
        }
        _;
    }

    /**
     * Whether the sale is finished
     */
    modifier finishedSale() {
        if (block.timestamp < saleEnd) {
            revert ESaleIsNotFinished();
        }
        _;
    }

    /**
     * Whether sold tokens are available to withdraw
     */
    modifier tokensUnlocked() {
        if (block.timestamp < unlockAt) {
            revert ETokensAreLocked();
        }
        _;
    }

    /**
     * Receive ETH and perform the sale
     */
    receive() external payable {
        require(msg.value >= minSaleEther(), "Less than min sale");
        require(msg.value <= maxSaleEther(), "More than max sale");
        uint256 amount = msg.value * tokensPerEth;
        _sale(msg.sender, amount);
    }

    function minSaleEther() public pure returns (uint256) {
        return (minSale * 10 ** 18) / tokensPerEth;
    }

    function maxSaleEther() public pure returns (uint256) {
        return (maxSale * 10 ** 18) / tokensPerEth;
    }

    /**
     * Display the balance of account (sold tokens)
     * @param account Account to check the balance of
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * Deposit funds to the sale
     * @param _amount Amount of tokens to sale
     */
    function deposit(uint256 _amount) external returns (bool) {
        require(block.timestamp < saleStart, "Sale started");
        uint256 toSell = (_amount / (100 + percentToDex)) * 100;
        saleAmount += toSell;
        token.transferFrom(msg.sender, address(this), _amount);
        return true;
    }

    function _sale(address to, uint256 amount) private activeSale {
        require(
            _balances[to] + amount <= maxSale * 10 ** 18,
            "More than max sale"
        );
        require(
            amount <= saleAmount,
            "Remaining sale amount is less then requested"
        );
        _balances[to] += amount;
        saleAmount -= amount;
        emit Sold(to, amount);
    }

    function withdraw() public virtual tokensUnlocked {
        uint256 value = _balances[msg.sender];
        require(value > 0, "Nothing to withdraw");
        token.transfer(msg.sender, value);
        _balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, value);
    }

    function dex() public virtual onlyOwner finishedSale {
        uint256 raisedEther = address(this).balance;
        uint256 etherToDex = raisedEther / 100 * percentToDex;
        uint256 etherToOwner = raisedEther - etherToDex;

        // Feed the dex pair with liquidity.

		// Send unsold tokens to the vault.
		uint256 unsoldTokens = token.balanceOf(address(this));
		token.transfer(unsoldContract, unsoldTokens);

        // Send remaining ETH to the owner.
        (bool sentEthOwner, ) = owner().call{value: etherToOwner}("");
        require(sentEthOwner, "Fail ETH to owner");
    }
}
