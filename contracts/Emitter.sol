// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EmissionRates} from "./EmissionRates.sol";

import {console} from "hardhat/console.sol";

interface IEmitter {
    event Filled(address from, uint256 amount);
    event Started(address by);
    event Withdrawn(address by, address to, uint256 amount);

    /// @return current epoch number
    function epoch() external view returns (uint256);

    /// @param _time -- time
    /// @return epoch number at the given time
    function epochAt(uint256 _time) external view returns (uint256);

    /// @return number of tokens being unlocked per second in the current epoch
    function rate() external view returns (uint256);

    /// @return emission start time
    function started() external view returns (uint256);

    /// @return number of locked tokens
    function locked() external view returns (uint256);

    /// @return number of tokens sent to the vault
    function released() external view returns (uint256);

    /// @return number of tokens available to withdraw
    function available() external view returns (uint256);

    /// @return number of seconds since last withdrawal
    function lastWithrawalAt() external view returns (uint256);

    /// @dev Transfer and lock tokens from sender to the contract
    /// @param _amount -- number of tokens
    function fill(uint256 _amount) external;

    /// @dev Start the emission
    /// @return true if started
    function start() external returns (bool);

    /// @dev withdraw available tokens from the emitter to the vault
    /// @return true if tokens were withdrawn, false if not
    function withdraw() external returns (bool);
}

contract Emitter is IEmitter, Ownable, ReentrancyGuard, EmissionRates {
    IERC20 public immutable token;
    address public immutable vault;
    uint256 public immutable epochLength = 30 days;
    uint256 public started;
    uint256 public released;
    uint256 public locked;
    uint256 public lastWithrawalAt;

    constructor(
        address _token,
        address _vault,
        address _initialOwner
    ) Ownable(_initialOwner) {
        token = IERC20(_token);
        vault = _vault;
    }

    function _epochTokens(uint256 _epoch) internal view returns (uint256) {
        uint _rate = this.rates(_epoch);
        return _rate * epochLength;
    }

    function _epochRange(
        uint256 _start,
        uint256 _end
    ) internal view returns (uint256, uint256) {
        return (this.epochAt(_start), this.epochAt(_end));
    }

    function _epochStartEnd(
        uint256 _epoch
    ) internal view returns (uint256, uint256) {
        return (
            started + _epoch * epochLength,
            started + (_epoch + 1) * epochLength - 1
        );
    }

    /// @dev Get amount of tokens which should be emitted within time range
    /// @param _start -- start time
    /// @param _end -- end time
    /// @return amount of tokens to emit
    function _getEmission(
        uint256 _start,
        uint256 _end
    ) internal view returns (uint256) {
        if (_start == _end) {
            return 0;
        }

        (uint256 _firstEpoch, uint256 _lastEpoch) = _epochRange(_start, _end);

        if (_firstEpoch == _lastEpoch) {
            return (_end - _start) * this.rates(_firstEpoch);
        }

        uint256 _epochStart;
        uint256 _epochEnd;

        (, _epochEnd) = _epochStartEnd(_firstEpoch);
        uint256 _amount = (_epochEnd + 1 - _start) * this.rates(_firstEpoch);

        for (uint256 _epoch = _firstEpoch + 1; _epoch < _lastEpoch; _epoch++) {
            (_epochStart, _epochEnd) = _epochStartEnd(_firstEpoch);
            _amount += (_epochEnd - _epochStart) * this.rates(_epoch);
        }

        (_epochStart, ) = _epochStartEnd(_lastEpoch);
        _amount += (_end - _epochStart) * this.rates(_lastEpoch);
        return _amount;
    }

    function epoch() external view returns (uint256) {
        return this.epochAt(block.timestamp);
    }

    function epochAt(uint256 _time) external view returns (uint256) {
        if (started == 0) {
            return 0;
        } else {
            return (_time - started) / epochLength;
        }
    }

    function epochData(
        uint256 _epoch
    ) external view returns (uint256, uint256, uint256) {
        (uint256 _start, uint256 _end) = _epochStartEnd(_epoch);
        return (_start, _end, this.rates(_epoch));
    }

    function rate() external view returns (uint256) {
        return this.rates(this.epoch());
    }

    function available() external view returns (uint256) {
        if (started == 0) {
            return 0;
        }

        uint256 amount = _getEmission(lastWithrawalAt, block.timestamp);

        return locked > amount ? amount : locked;
    }

    function fill(uint256 _amount) external nonReentrant {
        locked += _amount;
        token.transferFrom(msg.sender, address(this), _amount);
        emit Filled(msg.sender, _amount);
    }

    function start() external onlyOwner nonReentrant returns (bool) {
        require(locked > 0, "No tokens");
        require(started == 0, "Already started");
        started = block.timestamp;
        lastWithrawalAt = block.timestamp;
        emit Started(msg.sender);
        return true;
    }

	/// @dev This function might require large amount of gas when calling to withdraw after a very long period of time.
    function withdraw() external nonReentrant returns (bool) {
        require(started != 0, "Not started");
        uint256 amount = this.available();
        require(amount > 0, "Nothing to unlock");
        released += amount;
        locked -= amount;
        lastWithrawalAt = block.timestamp;
        token.transfer(vault, amount);
        emit Withdrawn(msg.sender, vault, amount);
        return true;
    }
}
