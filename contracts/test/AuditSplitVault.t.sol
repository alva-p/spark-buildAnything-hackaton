// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { AuditSplitVault } from "../src/AuditSplitVault.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = value / 100;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}

contract AuditSplitVaultTest is Test {
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal payer = makeAddr("payer");

    AuditSplitVault internal vault;
    MockToken internal token;

    function setUp() external {
        vault = _deploy(_recipients(), _shares());
        token = new MockToken();
    }

    function testRejectsZeroCommitment() external {
        vm.expectRevert(AuditSplitVault.InvalidCommitment.selector);
        new AuditSplitVault(creator, bytes32(0), _recipients(), _shares());
    }

    function testRejectsLengthMismatch() external {
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10_000;

        vm.expectRevert(AuditSplitVault.LengthMismatch.selector);
        _deploy(_recipients(), shares);
    }

    function testRejectsTooFewRecipients() external {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10_000;

        vm.expectRevert(AuditSplitVault.InvalidRecipientCount.selector);
        _deploy(recipients, shares);
    }

    function testRejectsTooManyRecipients() external {
        address[] memory recipients = new address[](11);
        uint16[] memory shares = new uint16[](11);
        for (uint256 i; i < recipients.length; ++i) {
            // Casting is safe because i is at most 10.
            // forge-lint: disable-next-line(unsafe-typecast)
            recipients[i] = address(uint160(i + 1));
            shares[i] = i == recipients.length - 1 ? 1_000 : 900;
        }

        vm.expectRevert(AuditSplitVault.InvalidRecipientCount.selector);
        _deploy(recipients, shares);
    }

    function testRejectsZeroRecipient() external {
        address[] memory recipients = _recipients();
        recipients[1] = address(0);

        vm.expectRevert(AuditSplitVault.ZeroRecipient.selector);
        _deploy(recipients, _shares());
    }

    function testRejectsDuplicateRecipient() external {
        address[] memory recipients = _recipients();
        recipients[1] = alice;

        vm.expectRevert(AuditSplitVault.DuplicateRecipient.selector);
        _deploy(recipients, _shares());
    }

    function testRejectsZeroShare() external {
        uint16[] memory shares = _shares();
        shares[1] = 0;

        vm.expectRevert(AuditSplitVault.InvalidShare.selector);
        _deploy(_recipients(), shares);
    }

    function testRejectsInvalidTotalShares() external {
        uint16[] memory shares = _shares();
        shares[1] = 3_999;

        vm.expectRevert(AuditSplitVault.InvalidTotalShares.selector);
        _deploy(_recipients(), shares);
    }

    function testActivatesOnlyAfterEveryRecipientAccepts() external {
        vm.prank(alice);
        vault.acceptAgreement();
        assertEq(uint256(vault.status()), uint256(AuditSplitVault.Status.Pending));
        assertEq(vault.acceptedCount(), 1);

        vm.prank(bob);
        vault.acceptAgreement();
        assertEq(uint256(vault.status()), uint256(AuditSplitVault.Status.Active));
        assertEq(vault.acceptedCount(), 2);
    }

    function testRejectsNonRecipientAcceptance() external {
        vm.expectRevert(AuditSplitVault.NotRecipient.selector);
        vm.prank(payer);
        vault.acceptAgreement();
    }

    function testRejectsDuplicateAcceptance() external {
        vm.prank(alice);
        vault.acceptAgreement();

        vm.expectRevert(AuditSplitVault.AlreadyAccepted.selector);
        vm.prank(alice);
        vault.acceptAgreement();
    }

    function testRejectsDepositBeforeActivation() external {
        vm.deal(payer, 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                AuditSplitVault.InvalidStatus.selector,
                AuditSplitVault.Status.Active,
                AuditSplitVault.Status.Pending
            )
        );
        vm.prank(payer);
        vault.depositNative{ value: 1 ether }();
    }

    function testSyncsForcedNativeBalanceOnlyOnce() external {
        _activate();
        vm.deal(address(vault), 101 wei);

        vault.syncNative();

        assertEq(vault.claimable(address(0), alice), 60 wei);
        assertEq(vault.claimable(address(0), bob), 41 wei);
        assertEq(vault.totalClaimable(address(0)), 101 wei);

        vm.expectRevert(AuditSplitVault.NoExcessBalance.selector);
        vault.syncNative();
    }

    function testDirectNativeTransferAllocatesAndCannotBeSyncedTwice() external {
        _activate();
        vm.deal(payer, 101 wei);

        vm.prank(payer);
        (bool success,) = payable(address(vault)).call{ value: 101 wei }("");

        assertTrue(success);
        assertEq(vault.claimable(address(0), alice), 60 wei);
        assertEq(vault.claimable(address(0), bob), 41 wei);
        assertEq(vault.totalClaimable(address(0)), 101 wei);

        vm.expectRevert(AuditSplitVault.NoExcessBalance.selector);
        vault.syncNative();
    }

    function testAllocatesNativeAndPreservesRemainder() external {
        _activate();
        vm.deal(payer, 101 wei);

        vm.prank(payer);
        vault.depositNative{ value: 101 wei }();

        assertEq(vault.claimable(address(0), alice), 60 wei);
        assertEq(vault.claimable(address(0), bob), 41 wei);
        assertEq(vault.totalClaimable(address(0)), 101 wei);
    }

    function testRecipientsClaimNativeIndependently() external {
        _activate();
        vm.deal(payer, 1 ether);

        vm.prank(payer);
        vault.depositNative{ value: 1 ether }();

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        vault.claim(address(0));

        assertEq(alice.balance - aliceBefore, 0.6 ether);
        assertEq(vault.claimable(address(0), alice), 0);
        assertEq(vault.claimable(address(0), bob), 0.4 ether);
        assertEq(vault.totalClaimable(address(0)), 0.4 ether);
    }

    function testDepositTokenAllocatesActualAmount() external {
        _activate();
        token.mint(payer, 1_000e18);

        vm.startPrank(payer);
        token.approve(address(vault), 1_000e18);
        vault.depositToken(address(token), 1_000e18);
        vm.stopPrank();

        assertEq(vault.claimable(address(token), alice), 600e18);
        assertEq(vault.claimable(address(token), bob), 400e18);
    }

    function testDepositFeeTokenAllocatesActualReceivedAmount() external {
        _activate();
        FeeToken feeToken = new FeeToken();
        feeToken.mint(payer, 1_000e18);

        vm.startPrank(payer);
        feeToken.approve(address(vault), 1_000e18);
        vault.depositToken(address(feeToken), 1_000e18);
        vm.stopPrank();

        assertEq(feeToken.balanceOf(address(vault)), 990e18);
        assertEq(vault.claimable(address(feeToken), alice), 594e18);
        assertEq(vault.claimable(address(feeToken), bob), 396e18);
        assertEq(vault.totalClaimable(address(feeToken)), 990e18);
    }

    function testSyncsDirectTokenTransfer() external {
        _activate();
        token.mint(address(vault), 500e18);

        vault.syncToken(address(token));

        assertEq(vault.claimable(address(token), alice), 300e18);
        assertEq(vault.claimable(address(token), bob), 200e18);

        vm.expectRevert(AuditSplitVault.NoExcessBalance.selector);
        vault.syncToken(address(token));
    }

    function testRecipientClaimsTokenWithoutAffectingAnother() external {
        _activate();
        token.mint(address(vault), 500e18);
        vault.syncToken(address(token));

        vm.prank(alice);
        vault.claim(address(token));

        assertEq(token.balanceOf(alice), 300e18);
        assertEq(vault.claimable(address(token), alice), 0);
        assertEq(vault.claimable(address(token), bob), 200e18);
        assertEq(vault.totalClaimable(address(token)), 200e18);
    }

    function testRejectsZeroClaim() external {
        vm.expectRevert(AuditSplitVault.NothingToClaim.selector);
        vm.prank(alice);
        vault.claim(address(token));
    }

    function testOnlyCreatorCanCancelPendingVault() external {
        vm.expectRevert(AuditSplitVault.NotCreator.selector);
        vm.prank(alice);
        vault.cancel();

        vm.prank(creator);
        vault.cancel();
        assertEq(uint256(vault.status()), uint256(AuditSplitVault.Status.Cancelled));
    }

    function testCancelledVaultCannotAcceptOrReceiveDeposits() external {
        vm.prank(creator);
        vault.cancel();

        vm.expectRevert(
            abi.encodeWithSelector(
                AuditSplitVault.InvalidStatus.selector,
                AuditSplitVault.Status.Pending,
                AuditSplitVault.Status.Cancelled
            )
        );
        vm.prank(alice);
        vault.acceptAgreement();

        vm.deal(payer, 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                AuditSplitVault.InvalidStatus.selector,
                AuditSplitVault.Status.Active,
                AuditSplitVault.Status.Cancelled
            )
        );
        vm.prank(payer);
        vault.depositNative{ value: 1 ether }();
    }

    function testActiveVaultCannotBeCancelled() external {
        _activate();

        vm.expectRevert(
            abi.encodeWithSelector(
                AuditSplitVault.InvalidStatus.selector,
                AuditSplitVault.Status.Pending,
                AuditSplitVault.Status.Active
            )
        );
        vm.prank(creator);
        vault.cancel();
    }

    function _activate() internal {
        vm.prank(alice);
        vault.acceptAgreement();
        vm.prank(bob);
        vault.acceptAgreement();
    }

    function _deploy(address[] memory recipients, uint16[] memory shares)
        internal
        returns (AuditSplitVault)
    {
        return new AuditSplitVault(
            creator, keccak256("private-report-with-random-salt"), recipients, shares
        );
    }

    function _recipients() internal view returns (address[] memory recipients) {
        recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
    }

    function _shares() internal pure returns (uint16[] memory shares) {
        shares = new uint16[](2);
        shares[0] = 6_000;
        shares[1] = 4_000;
    }
}
