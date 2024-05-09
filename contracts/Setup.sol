// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

/**
 * @dev Helps to perform the setup only once
 */
abstract contract Setup {
	bool private _allSet;

	event SetupMade();

	modifier isSetup() {
		require(_allSet == false, "Already setup");
		_;
		_allSet = true;
		emit SetupMade();
	}
}
