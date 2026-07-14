// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AuditSplitFactory } from "../src/AuditSplitFactory.sol";
import { AuditSplitVault } from "../src/AuditSplitVault.sol";

contract AuditSplitFactoryTest is Test {
    function testCreatesAndIndexesVault() external {
        AuditSplitFactory factory = new AuditSplitFactory();
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint16[] memory shares = new uint16[](2);
        shares[0] = 7_000;
        shares[1] = 3_000;

        address vaultAddress = factory.createVault(keccak256("commitment"), recipients, shares);

        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaultAt(0), vaultAddress);
        assertEq(AuditSplitVault(payable(vaultAddress)).creator(), address(this));
    }
}
