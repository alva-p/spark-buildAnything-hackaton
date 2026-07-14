// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AuditSplitVault } from "./AuditSplitVault.sol";

/// @title AuditSplitFactory
/// @notice Deploys dedicated immutable payout vaults for collaborative reports.
contract AuditSplitFactory {
    event VaultCreated(
        address indexed vault,
        address indexed creator,
        bytes32 indexed reportCommitment,
        address[] recipients,
        uint16[] sharesBps
    );

    address[] private _vaults;
    mapping(address creator => address[] vaults) private _vaultsByCreator;

    function createVault(
        bytes32 reportCommitment,
        address[] calldata recipients,
        uint16[] calldata sharesBps
    ) external returns (address vault) {
        AuditSplitVault deployed = new AuditSplitVault(
            msg.sender, reportCommitment, recipients, sharesBps
        );

        vault = address(deployed);
        _vaults.push(vault);
        _vaultsByCreator[msg.sender].push(vault);

        emit VaultCreated(vault, msg.sender, reportCommitment, recipients, sharesBps);
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    function vaultAt(uint256 index) external view returns (address) {
        return _vaults[index];
    }

    function getVaultsByCreator(address creator) external view returns (address[] memory) {
        return _vaultsByCreator[creator];
    }
}
