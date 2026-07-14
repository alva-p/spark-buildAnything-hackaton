// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AuditSplitVault
/// @notice Immutable payout agreement for one collaborative security report.
/// @dev Stores only a privacy-preserving report commitment, never report details.
contract AuditSplitVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MIN_RECIPIENTS = 2;
    uint256 public constant MAX_RECIPIENTS = 10;
    address public constant NATIVE_ASSET = address(0);

    enum Status {
        Pending,
        Active,
        Cancelled
    }

    error InvalidCommitment();
    error InvalidRecipientCount();
    error LengthMismatch();
    error ZeroRecipient();
    error DuplicateRecipient();
    error InvalidShare();
    error InvalidTotalShares();
    error NotRecipient();
    error AlreadyAccepted();
    error InvalidStatus(Status expected, Status actual);
    error NotCreator();
    error ZeroAmount();
    error NoExcessBalance();
    error NothingToClaim();
    error InvalidToken();
    error NativeTransferFailed();

    event AgreementAccepted(address indexed recipient, uint256 acceptedCount);
    event VaultActivated();
    event FundsAllocated(address indexed asset, address indexed sender, uint256 amount);
    event Claimed(address indexed asset, address indexed recipient, uint256 amount);
    event VaultCancelled();

    address public immutable creator;
    bytes32 public immutable reportCommitment;

    Status public status;
    uint256 public acceptedCount;

    address[] private _recipients;
    uint16[] private _sharesBps;

    mapping(address recipient => bool value) public isRecipient;
    mapping(address recipient => bool value) public hasAccepted;
    mapping(address asset => mapping(address recipient => uint256 amount)) public claimable;
    mapping(address asset => uint256 amount) public totalClaimable;

    constructor(
        address creator_,
        bytes32 reportCommitment_,
        address[] memory recipients_,
        uint16[] memory sharesBps_
    ) {
        if (creator_ == address(0)) revert ZeroRecipient();
        if (reportCommitment_ == bytes32(0)) revert InvalidCommitment();
        if (recipients_.length != sharesBps_.length) revert LengthMismatch();
        if (recipients_.length < MIN_RECIPIENTS || recipients_.length > MAX_RECIPIENTS) {
            revert InvalidRecipientCount();
        }

        uint256 totalShares;
        for (uint256 i; i < recipients_.length; ++i) {
            address recipient = recipients_[i];
            uint16 share = sharesBps_[i];

            if (recipient == address(0)) revert ZeroRecipient();
            if (share == 0) revert InvalidShare();
            if (isRecipient[recipient]) revert DuplicateRecipient();

            isRecipient[recipient] = true;
            _recipients.push(recipient);
            _sharesBps.push(share);
            totalShares += share;
        }

        if (totalShares != BPS_DENOMINATOR) revert InvalidTotalShares();

        creator = creator_;
        reportCommitment = reportCommitment_;
        status = Status.Pending;
    }

    /// @notice Accept the immutable payout terms as a listed recipient.
    function acceptAgreement() external {
        _requireStatus(Status.Pending);
        if (!isRecipient[msg.sender]) revert NotRecipient();
        if (hasAccepted[msg.sender]) revert AlreadyAccepted();

        hasAccepted[msg.sender] = true;
        acceptedCount += 1;
        emit AgreementAccepted(msg.sender, acceptedCount);

        if (acceptedCount == _recipients.length) {
            status = Status.Active;
            emit VaultActivated();
        }
    }

    /// @notice Cancel a vault that has not yet activated.
    function cancel() external {
        _requireStatus(Status.Pending);
        if (msg.sender != creator) revert NotCreator();

        status = Status.Cancelled;
        emit VaultCancelled();
    }

    /// @notice Deposit native MON into an active vault and allocate it to recipients.
    function depositNative() external payable {
        _requireStatus(Status.Active);
        if (msg.value == 0) revert ZeroAmount();
        _allocate(NATIVE_ASSET, msg.value, msg.sender);
    }

    /// @notice Allocate native MON that reached the vault without executing a normal deposit path.
    function syncNative() external {
        _requireStatus(Status.Active);
        uint256 accounted = totalClaimable[NATIVE_ASSET];
        uint256 currentBalance = address(this).balance;
        if (currentBalance <= accounted) revert NoExcessBalance();

        _allocate(NATIVE_ASSET, currentBalance - accounted, msg.sender);
    }

    /// @notice Transfer an ERC-20 into the vault and allocate the actual received amount.
    function depositToken(address token, uint256 amount) external nonReentrant {
        _requireStatus(Status.Active);
        if (token == address(0)) revert InvalidToken();
        if (amount == 0) revert ZeroAmount();

        IERC20 asset = IERC20(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = asset.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();

        _allocate(token, received, msg.sender);
    }

    /// @notice Allocate ERC-20 tokens transferred directly to the vault address.
    function syncToken(address token) external {
        _requireStatus(Status.Active);
        if (token == address(0)) revert InvalidToken();

        uint256 currentBalance = IERC20(token).balanceOf(address(this));
        uint256 accounted = totalClaimable[token];
        if (currentBalance <= accounted) revert NoExcessBalance();

        _allocate(token, currentBalance - accounted, msg.sender);
    }

    /// @notice Claim the caller's entire balance for one asset.
    /// @param asset Use address(0) for native MON or an ERC-20 contract address.
    function claim(address asset) external nonReentrant {
        uint256 amount = claimable[asset][msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[asset][msg.sender] = 0;
        totalClaimable[asset] -= amount;

        if (asset == NATIVE_ASSET) {
            (bool success,) = payable(msg.sender).call{ value: amount }("");
            if (!success) revert NativeTransferFailed();
        } else {
            IERC20(asset).safeTransfer(msg.sender, amount);
        }

        emit Claimed(asset, msg.sender, amount);
    }

    /// @notice Return all recipient addresses in payout order.
    function getRecipients() external view returns (address[] memory) {
        return _recipients;
    }

    /// @notice Return shares matching `getRecipients`, expressed in basis points.
    function getSharesBps() external view returns (uint16[] memory) {
        return _sharesBps;
    }

    function recipientCount() external view returns (uint256) {
        return _recipients.length;
    }

    receive() external payable {
        _requireStatus(Status.Active);
        if (msg.value == 0) revert ZeroAmount();
        _allocate(NATIVE_ASSET, msg.value, msg.sender);
    }

    function _allocate(address asset, uint256 amount, address sender) internal {
        uint256 remaining = amount;
        uint256 lastIndex = _recipients.length - 1;

        for (uint256 i; i < lastIndex; ++i) {
            uint256 recipientAmount = (amount * _sharesBps[i]) / BPS_DENOMINATOR;
            remaining -= recipientAmount;
            claimable[asset][_recipients[i]] += recipientAmount;
        }

        claimable[asset][_recipients[lastIndex]] += remaining;
        totalClaimable[asset] += amount;

        emit FundsAllocated(asset, sender, amount);
    }

    function _requireStatus(Status expected) internal view {
        Status actual = status;
        if (actual != expected) revert InvalidStatus(expected, actual);
    }
}
