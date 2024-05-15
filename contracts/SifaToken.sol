// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SifaToken is ERC20, Ownable {
    constructor(
        address initialOwner_
    ) ERC20("sifa.game", "SIFA") Ownable(initialOwner_) {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }
}
