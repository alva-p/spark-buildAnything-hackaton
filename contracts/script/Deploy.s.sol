// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { AuditSplitFactory } from "../src/AuditSplitFactory.sol";

contract DeployAuditSplit is Script {
    function run() external returns (AuditSplitFactory factory) {
        vm.startBroadcast();
        factory = new AuditSplitFactory();
        vm.stopBroadcast();

        console2.log("AuditSplitFactory deployed at", address(factory));
    }
}
