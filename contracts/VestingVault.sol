// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

interface IVestingVault {
    event Released(uint256 amount, address to);
    event Vested(uint256 amount, address to, uint64 start, uint64 duration);

    function start(address vester) external view returns (uint256);

    function duration(address vester) external view returns (uint256);

    function end(address vester) external view returns (uint256);

    function released(address to) external view returns (uint256);

    function releasable(address to) external view returns (uint256);

    function vested(address to) external view returns (uint256);

    function vest(
        address to,
        uint256 amount,
        uint64 start_,
        uint64 duration_
    ) external;

    function release() external;

    function vestedAmount(
        address to,
        uint64 timestamp
    ) external view returns (uint256);
}

contract VestingVault is Context, ReentrancyGuard {
    error VestingVaultZeroDuration();
    error VestingVaultStartInPast();
    error VestingVaultVestAfterStart();
    error VestingVaultAlreadySetup();
    error VestingVaultDurationAlreadySet();
    error VestingVaultNothingToRelease();

    event Released(uint256 amount, address to);
    event Vested(uint256 amount, address to, uint64 start, uint64 duration);

    IERC20 public immutable token;
    mapping(address vester => uint256) private _vested;
    mapping(address vester => uint256) private _released;
    mapping(address vester => uint64) private _start;
    mapping(address vester => uint64) private _duration;

    constructor(address token_) {
        token = IERC20(token_);
    }

    /**
     * @dev Getter for the start timestamp.
     */
    function start(address vester) public view virtual returns (uint256) {
        return _start[vester];
    }

    /**
     * @dev Getter for the vesting duration.
     */
    function duration(address vester) public view virtual returns (uint256) {
        return _duration[vester];
    }

    /**
     * @dev Getter for the end timestamp.
     */
    function end(address vester) public view virtual returns (uint256) {
        return start(vester) + duration(vester);
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
    function vest(
        address to,
        uint256 amount,
        uint64 start_,
        uint64 duration_
    ) public virtual {
        _vested[to] += amount;
        if (_start[to] == 0) {
            _start[to] = start_;
        }
        if (_duration[to] == 0) {
            _duration[to] = duration_;
        }
        token.transferFrom(_msgSender(), address(this), amount);
        emit Vested(amount, to, _start[to], _duration[to]);
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
        emit Released(amount, vester);
        token.transfer(vester, amount);
    }

    /**
     * @dev Calculates the amount of tokens that has already vested. Default implementation is a linear vesting curve.
     */
    function vestedAmount(
        address to,
        uint64 timestamp
    ) public view virtual returns (uint256) {
        return
            _vestingSchedule(_vested[to], _start[to], _duration[to], timestamp);
    }

    /**
     * @dev Virtual implementation of the vesting formula. This returns the amount vested, as a function of time, for
     * an asset given its total historical allocation.
     */
    function _vestingSchedule(
        uint256 totalAllocation,
        uint64 start_,
        uint64 duration_,
        uint64 timestamp
    ) internal view virtual returns (uint256) {
        if (timestamp < start_) {
            return 0;
        } else if (timestamp >= (start_ + duration_)) {
            return totalAllocation;
        } else {
            return (totalAllocation * (timestamp - start_)) / duration_;
        }
    }
}
