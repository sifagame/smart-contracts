// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

contract VestingVault is Context, Ownable, ReentrancyGuard {
    error VestingVaultZeroDuration();
    error VestingVaultStartInPast();
    error VestingVaultVestAfterStart();
    error VestingVaultAlreadySetup();
    error VestingVaultDurationAlreadySet();
    error VestingVaultNothingToRelease();

    event Setup(uint64 start, uint64 duration);
    event Released(uint256 amount);
    event Vested(uint256 amount, address to);

    mapping(address vester => uint256) private _vested;
    mapping(address vester => uint256) private _released;
    IERC20 private immutable _token;
    uint64 private _start;
    uint64 private _duration;

    constructor(address initialOwner, address token) Ownable(initialOwner) {
        _token = IERC20(token);
    }

    function setup(
        uint64 startTime,
        uint64 durationTime
    ) public virtual onlyOwner {
        if (_start != 0) {
            revert VestingVaultAlreadySetup();
        }
        if (startTime <= block.timestamp) {
            revert VestingVaultStartInPast();
        }
        if (durationTime == 0) {
            revert VestingVaultZeroDuration();
        }
        _start = startTime;
        _duration = durationTime;
        emit Setup(_start, _duration);
    }

    /**
     * @dev Getter for the start timestamp.
     */
    function start() public view virtual returns (uint256) {
        return _start;
    }

    /**
     * @dev Getter for the vesting duration.
     */
    function duration() public view virtual returns (uint256) {
        return _duration;
    }

    /**
     * @dev Getter for the end timestamp.
     */
    function end() public view virtual returns (uint256) {
        return start() + duration();
    }

    /**
     * @dev Amount of tokens already released
     */
    function released(address to) public view virtual returns (uint256) {
        return _released[to];
    }

    /**
     * @dev Getter for the amount of releasable tokens.
     */
    function releasable(address to) public view virtual returns (uint256) {
        return vestedAmount(to, uint64(block.timestamp)) - released(to);
    }

    /**
     * @dev Amount of total tokens vested to msg.sender
     */
    function vested(address to) public view virtual returns (uint256) {
        return _vested[to];
    }

    /**
     * @dev Vest tokens
     *
     * Emits a {Vested} event.
     */
    function vest(address to, uint256 amount) public virtual {
        if (block.timestamp >= start()) {
            revert VestingVaultVestAfterStart();
        }

        _vested[to] += amount;
        emit Vested(amount, to);
        _token.transferFrom(_msgSender(), address(this), amount);
    }

    /**
     * @dev Release the token that have already vested.
     *
     * Emits a {Released} event.
     */
    function release() public virtual nonReentrant {
        address vester = _msgSender();
        uint256 amount = releasable(vester);
        if (amount == 0) {
            revert VestingVaultNothingToRelease();
        }
        _released[vester] += amount;
        emit Released(amount);
        _token.transfer(vester, amount);
    }

    /**
     * @dev Calculates the amount of tokens that has already vested. Default implementation is a linear vesting curve.
     */
    function vestedAmount(
		address to,
        uint64 timestamp
    ) public view virtual returns (uint256) {
        return _vestingSchedule(_vested[to], timestamp);
    }

    /**
     * @dev Virtual implementation of the vesting formula. This returns the amount vested, as a function of time, for
     * an asset given its total historical allocation.
     */
    function _vestingSchedule(
        uint256 totalAllocation,
        uint64 timestamp
    ) internal view virtual returns (uint256) {
        if (timestamp < start()) {
            return 0;
        } else if (timestamp >= end()) {
            return totalAllocation;
        } else {
            return (totalAllocation * (timestamp - start())) / duration();
        }
    }
}
