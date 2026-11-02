// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ZekroGroupBook} from "../src/ZekroGroupBook.sol";
import {MockCheck, StrictCheck} from "./Mocks.sol";

contract ZekroGroupBookTest is Test {
    ZekroGroupBook book;
    MockCheck check;

    address admin = makeAddr("admin");
    address curator = makeAddr("curator");
    address keeper = makeAddr("keeper");
    address stranger = makeAddr("stranger");
    address next = makeAddr("next");

    uint256 constant ROOT = 0x1234;
    bytes constant PROOF = hex"abcd";

    event ProofAccepted(uint256 indexed groupId, uint256 indexed scopeId, uint256 indexed nullifier, uint256 rootSeq, uint256 signal, address sender, string note);
    event GroupCreated(uint256 indexed groupId, address indexed admin, string name, bytes32 metadataHash, bool openEnrollment);

    function setUp() public {
        check = new MockCheck();
        book = new ZekroGroupBook(address(check));
    }

    // ------------------------------------------------------------------ helpers

    function _group() internal returns (uint256 id) {
        vm.prank(admin);
        id = book.createGroup("Readers", keccak256("meta"), false);
    }

    function _roles(uint256 id) internal {
        vm.startPrank(admin);
        book.setRoles(id, curator, book.ROLE_CURATOR());
        book.setRoles(id, keeper, book.ROLE_SCOPE_KEEPER());
        vm.stopPrank();
    }

    function _one(uint256 c) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = c;
    }

    function _digest(uint256 id) internal view returns (bytes32) {
        return book.groupOf(id).leavesDigest;
    }

    /// Group with one commitment, one root and one open scope.
    function _ready() internal returns (uint256 id, uint256 seq, uint256 scopeId) {
        id = _group();
        vm.startPrank(admin);
        book.addCommitments(id, _one(77));
        seq = book.publishRoot(id, ROOT, _digest(id));
        scopeId = book.openScope(id, "vote 1", 0);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ construction

    function test_constructorRefusesAddressWithoutCode() public {
        vm.expectRevert(ZekroGroupBook.CheckerHasNoCode.selector);
        new ZekroGroupBook(makeAddr("nothing"));
    }

    function test_takesNoEther() public {
        (bool ok, ) = address(book).call{value: 1}("");
        assertFalse(ok);
        assertEq(address(book).balance, 0);
    }

    // ------------------------------------------------------------------ groups

    function test_createGroupStartsForming() public {
        vm.expectEmit(true, true, false, true);
        emit GroupCreated(1, admin, "Readers", keccak256("meta"), false);
        uint256 id = _group();
        assertEq(id, 1);
        ZekroGroupBook.Group memory g = book.groupOf(id);
        assertEq(g.admin, admin);
        assertEq(uint8(g.status), uint8(ZekroGroupBook.GroupStatus.Forming));
        assertEq(g.leafCount, 0);
        assertEq(book.groupCount(), 1);
    }

    function test_groupNameRules() public {
        vm.expectRevert(ZekroGroupBook.BadName.selector);
        book.createGroup("", 0, false);
        vm.expectRevert(ZekroGroupBook.BadName.selector);
        book.createGroup("0123456789012345678901234567890123", 0, false);
        vm.expectRevert(ZekroGroupBook.BadName.selector);
        book.createGroup(unicode"café", 0, false);
        vm.expectRevert(ZekroGroupBook.BadName.selector);
        book.createGroup("line\nbreak", 0, false);
    }

    function test_unknownGroupRefused() public {
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownGroup.selector, 9));
        book.addCommitments(9, _one(1));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownGroup.selector, 9));
        book.setRoles(9, curator, 1);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownGroup.selector, 9));
        book.acceptAdmin(9);
    }

    // ------------------------------------------------------------------ roles matrix

    function test_onlyAdminSetsRoles() public {
        uint256 id = _group();
        _roles(id);
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAdmin.selector, id, curator));
        book.setRoles(id, stranger, 1);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BadRole.selector, uint8(4)));
        book.setRoles(id, stranger, 4);
        vm.prank(admin);
        vm.expectRevert(ZekroGroupBook.ZeroAddress.selector);
        book.setRoles(id, address(0), 1);
        assertEq(book.rolesOf(id, curator), 1);
        assertEq(book.rolesOf(id, keeper), 2);
    }

    function test_rolesArePerGroup() public {
        uint256 a = _group();
        uint256 b = _group();
        vm.prank(admin);
        book.setRoles(a, curator, 1);
        vm.prank(curator);
        book.addCommitments(a, _one(1));
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, b, curator, uint8(1)));
        book.addCommitments(b, _one(1));
    }

    function test_curatorCannotKeepScopesAndKeeperCannotCurate() public {
        uint256 id = _group();
        _roles(id);
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, curator, uint8(2)));
        book.openScope(id, "x", 0);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, keeper, uint8(1)));
        book.addCommitments(id, _one(1));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, keeper, uint8(1)));
        book.publishRoot(id, ROOT, 0);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, keeper, uint8(1)));
        book.clearCommitment(id, 0);
    }

    function test_removedRoleStopsWorking() public {
        uint256 id = _group();
        _roles(id);
        vm.prank(admin);
        book.setRoles(id, curator, 0);
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, curator, uint8(1)));
        book.addCommitments(id, _one(1));
    }

    function test_onlyAdminPausesRetiresRevokes() public {
        (uint256 id, uint256 seq, ) = _ready();
        _roles(id);
        vm.startPrank(curator);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAdmin.selector, id, curator));
        book.pauseGroup(id);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAdmin.selector, id, curator));
        book.retireGroup(id);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAdmin.selector, id, curator));
        book.revokeRoot(id, seq);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAdmin.selector, id, curator));
        book.offerAdmin(id, curator);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ admin handover

    function test_adminHandoverIsTwoSteps() public {
        uint256 id = _group();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotPendingAdmin.selector, id, stranger));
        book.acceptAdmin(id);
        vm.prank(admin);
        book.offerAdmin(id, next);
        assertEq(book.groupOf(id).admin, admin);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotPendingAdmin.selector, id, stranger));
        book.acceptAdmin(id);
        vm.prank(next);
        book.acceptAdmin(id);
        assertEq(book.groupOf(id).admin, next);
        assertEq(book.groupOf(id).pendingAdmin, address(0));
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAdmin.selector, id, admin));
        book.pauseGroup(id);
    }

    function test_adminOfferCanBeCancelled() public {
        uint256 id = _group();
        vm.startPrank(admin);
        book.offerAdmin(id, next);
        book.offerAdmin(id, address(0));
        vm.stopPrank();
        vm.prank(next);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotPendingAdmin.selector, id, next));
        book.acceptAdmin(id);
    }

    // ------------------------------------------------------------------ commitments

    function test_addCommitmentsUpdatesDigestAndCount() public {
        uint256 id = _group();
        uint256[] memory list = new uint256[](2);
        list[0] = 5;
        list[1] = 6;
        vm.prank(admin);
        book.addCommitments(id, list);
        bytes32 d = keccak256(abi.encode(bytes32(0), uint8(1), uint32(0), uint256(5)));
        d = keccak256(abi.encode(d, uint8(1), uint32(1), uint256(6)));
        assertEq(_digest(id), d);
        assertEq(book.groupOf(id).leafCount, 2);
        assertEq(book.leafAt(id, 0), 5);
        assertEq(book.leafAt(id, 1), 6);
        assertEq(book.totalCommitments(), 2);
    }

    function test_leavesPageReadsTheListFromState() public {
        uint256 id = _group();
        uint256[] memory list = new uint256[](3);
        list[0] = 5;
        list[1] = 6;
        list[2] = 7;
        vm.startPrank(admin);
        book.addCommitments(id, list);
        book.clearCommitment(id, 1);
        vm.stopPrank();
        uint256[] memory page = book.leavesPage(id, 0, 10);
        assertEq(page.length, 3);
        assertEq(page[0], 5);
        assertEq(page[1], 0);
        assertEq(page[2], 7);
        assertEq(book.leavesPage(id, 2, 10).length, 1);
        assertEq(book.leavesPage(id, 3, 10).length, 0);
        assertEq(book.leavesPage(id, 0, 2).length, 2);
        assertEq(book.nameOf(id), "Readers");
    }

    function test_badCommitmentsRefused() public {
        uint256 id = _group();
        uint256 field = book.FIELD();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BadCommitment.selector, 0));
        book.addCommitments(id, _one(0));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BadCommitment.selector, field));
        book.addCommitments(id, _one(field));
        book.addCommitments(id, _one(3));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.CommitmentAlreadyAdded.selector, id, 3));
        book.addCommitments(id, _one(3));
        vm.stopPrank();
    }

    function test_batchSizeLimits() public {
        uint256 id = _group();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BatchSize.selector, 0));
        book.addCommitments(id, new uint256[](0));
        uint256 big = book.MAX_BATCH() + 1;
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BatchSize.selector, big));
        book.addCommitments(id, new uint256[](big));
        vm.stopPrank();
    }

    function test_treeFullRefused() public {
        uint256 id = _group();
        // groupOf layout: slot of _groups is 4 (after the four counters); leafCount lives in the first word.
        bytes32 slot = keccak256(abi.encode(id, uint256(4)));
        bytes32 word = vm.load(address(book), slot);
        uint256 max = book.MAX_LEAVES();
        // admin (160) + status (8) + openEnrollment (8) = 176 bits below leafCount.
        vm.store(address(book), slot, bytes32(uint256(word) | (max << 176)));
        assertEq(book.groupOf(id).leafCount, max);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.TreeFull.selector, id));
        book.addCommitments(id, _one(1));
    }

    function test_openEnrollmentLetsAnyoneAddButNotPublish() public {
        vm.prank(admin);
        uint256 id = book.createGroup("Open", 0, true);
        vm.prank(stranger);
        book.addCommitments(id, _one(9));
        assertEq(book.groupOf(id).leafCount, 1);
        vm.startPrank(stranger);
        bytes32 d = _digest(id);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, stranger, uint8(1)));
        book.publishRoot(id, ROOT, d);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, stranger, uint8(1)));
        book.clearCommitment(id, 0);
        vm.stopPrank();
    }

    function test_closedEnrollmentRefusesStrangers() public {
        uint256 id = _group();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, stranger, uint8(1)));
        book.addCommitments(id, _one(9));
    }

    function test_clearCommitment() public {
        uint256 id = _group();
        vm.startPrank(admin);
        book.addCommitments(id, _one(9));
        bytes32 before = _digest(id);
        book.clearCommitment(id, 0);
        assertEq(book.leafAt(id, 0), 0);
        assertEq(_digest(id), keccak256(abi.encode(before, uint8(2), uint32(0), uint256(9))));
        // Cleared: cannot be cleared again and cannot come back.
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownLeaf.selector, id, 0));
        book.clearCommitment(id, 0);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.CommitmentAlreadyAdded.selector, id, 9));
        book.addCommitments(id, _one(9));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownLeaf.selector, id, 5));
        book.clearCommitment(id, 5);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ roots

    function test_firstRootActivatesGroup() public {
        uint256 id = _group();
        vm.startPrank(admin);
        book.addCommitments(id, _one(1));
        uint256 seq = book.publishRoot(id, ROOT, _digest(id));
        vm.stopPrank();
        assertEq(seq, 1);
        ZekroGroupBook.Group memory g = book.groupOf(id);
        assertEq(uint8(g.status), uint8(ZekroGroupBook.GroupStatus.Active));
        ZekroGroupBook.RootEntry memory r = book.rootOf(id, 1);
        assertEq(r.root, ROOT);
        assertEq(r.leafCount, 1);
        assertEq(r.leavesDigest, g.leavesDigest);
        assertEq(book.totalRoots(), 1);
    }

    function test_rootForAnOlderListRefused() public {
        uint256 id = _group();
        vm.startPrank(admin);
        book.addCommitments(id, _one(1));
        bytes32 old = _digest(id);
        book.addCommitments(id, _one(2));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.StaleList.selector, old, _digest(id)));
        book.publishRoot(id, ROOT, old);
        vm.stopPrank();
    }

    function test_badRootsRefused() public {
        uint256 id = _group();
        uint256 field = book.FIELD();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BadRoot.selector, 0));
        book.publishRoot(id, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BadRoot.selector, field));
        book.publishRoot(id, field, 0);
        vm.stopPrank();
    }

    function test_revokeRootOnce() public {
        (uint256 id, uint256 seq, ) = _ready();
        vm.startPrank(admin);
        book.revokeRoot(id, seq);
        assertTrue(book.rootOf(id, seq).revoked);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.RootAlreadyRevoked.selector, id, seq));
        book.revokeRoot(id, seq);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownRoot.selector, id, 99));
        book.revokeRoot(id, 99);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ state machine

    function test_statusMachine() public {
        uint256 id = _group();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Forming));
        book.pauseGroup(id);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Forming));
        book.resumeGroup(id);
        book.addCommitments(id, _one(1));
        book.publishRoot(id, ROOT, _digest(id));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Active));
        book.resumeGroup(id);
        book.pauseGroup(id);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Paused));
        book.pauseGroup(id);
        book.resumeGroup(id);
        book.retireGroup(id);
        assertEq(uint8(book.groupOf(id).status), uint8(ZekroGroupBook.GroupStatus.Retired));
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Retired));
        book.retireGroup(id);
        vm.stopPrank();
    }

    function test_retiredGroupAcceptsNothingNew() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        bytes32 d = _digest(id);
        vm.startPrank(admin);
        book.retireGroup(id);
        bytes memory err = abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Retired);
        vm.expectRevert(err);
        book.addCommitments(id, _one(2));
        vm.expectRevert(err);
        book.clearCommitment(id, 0);
        vm.expectRevert(err);
        book.publishRoot(id, ROOT, d);
        vm.expectRevert(err);
        book.openScope(id, "x", 0);
        vm.expectRevert(err);
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, "");
        vm.expectRevert(err);
        book.pauseGroup(id);
        vm.stopPrank();
        // History stays readable.
        assertEq(book.rootOf(id, seq).root, ROOT);
    }

    function test_retiringClearsAnOfferedAdmin() public {
        uint256 id = _group();
        vm.startPrank(admin);
        book.offerAdmin(id, next);
        book.retireGroup(id);
        vm.stopPrank();
        vm.prank(next);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotPendingAdmin.selector, id, next));
        book.acceptAdmin(id);
    }

    // ------------------------------------------------------------------ scopes

    function test_scopeOpenAndClose() public {
        (uint256 id, , uint256 scopeId) = _ready();
        ZekroGroupBook.Scope memory s = book.scopeOf(id, scopeId);
        assertEq(uint8(s.status), uint8(ZekroGroupBook.ScopeStatus.Open));
        assertEq(s.field, book.scopeField(id, scopeId));
        assertEq(s.field >> 248, 0);
        assertEq(book.labelOf(id, scopeId), "vote 1");
        vm.startPrank(admin);
        book.closeScope(id, scopeId);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.ScopeNotOpen.selector, id, scopeId));
        book.closeScope(id, scopeId);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownScope.selector, id, 99));
        book.closeScope(id, 99);
        vm.stopPrank();
    }

    function test_scopeRules() public {
        uint256 id = _group();
        vm.warp(1000);
        vm.startPrank(admin);
        vm.expectRevert(ZekroGroupBook.BadLabel.selector);
        book.openScope(id, "", 0);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.BadClosingTime.selector, uint64(1000)));
        book.openScope(id, "x", 1000);
        vm.stopPrank();
    }

    function test_scopeFieldDiffersByGroupAndScope() public view {
        assertTrue(book.scopeField(1, 1) != book.scopeField(1, 2));
        assertTrue(book.scopeField(1, 1) != book.scopeField(2, 1));
    }

    // ------------------------------------------------------------------ proofs

    function test_submitProofRecordsNullifier() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        vm.expectEmit(true, true, true, true);
        emit ProofAccepted(id, scopeId, 55, seq, 66, stranger, "hello");
        vm.prank(stranger);
        book.submitProof(id, scopeId, seq, 55, 66, PROOF, "hello");
        assertTrue(book.isNullifierUsed(id, scopeId, 55));
        assertEq(book.scopeOf(id, scopeId).proofs, 1);
        assertEq(book.totalProofs(), 1);
    }

    function test_sameNullifierRefusedInSameScopeOnly() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        book.submitProof(id, scopeId, seq, 55, 66, PROOF, "");
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NullifierUsed.selector, id, scopeId, 55));
        book.submitProof(id, scopeId, seq, 55, 67, PROOF, "");
        vm.prank(admin);
        uint256 other = book.openScope(id, "vote 2", 0);
        book.submitProof(id, other, seq, 55, 66, PROOF, "");
        assertEq(book.totalProofs(), 2);
    }

    function test_refusedProofRecordsNothing() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        check.setMode(MockCheck.Mode.Refuse);
        vm.expectRevert(ZekroGroupBook.ProofRejected.selector);
        book.submitProof(id, scopeId, seq, 55, 66, PROOF, "");
        check.setMode(MockCheck.Mode.Revert);
        vm.expectRevert(ZekroGroupBook.ProofRejected.selector);
        book.submitProof(id, scopeId, seq, 55, 66, PROOF, "");
        assertFalse(book.isNullifierUsed(id, scopeId, 55));
        assertEq(book.totalProofs(), 0);
    }

    function test_bookPassesExactPublicInputs() public {
        StrictCheck strict = new StrictCheck();
        ZekroGroupBook b = new ZekroGroupBook(address(strict));
        vm.startPrank(admin);
        uint256 id = b.createGroup("S", 0, false);
        b.addCommitments(id, _one(1));
        uint256 seq = b.publishRoot(id, ROOT, b.groupOf(id).leavesDigest);
        uint256 scopeId = b.openScope(id, "s", 0);
        vm.stopPrank();
        strict.expect(bytes32(ROOT), bytes32(b.scopeField(id, scopeId)), bytes32(uint256(55)), bytes32(uint256(66)));
        b.submitProof(id, scopeId, seq, 55, 66, PROOF, "");
        vm.expectRevert(ZekroGroupBook.ProofRejected.selector);
        b.submitProof(id, scopeId, seq, 56, 66, PROOF, "");
    }

    function test_proofGatesInOrder() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownGroup.selector, 9));
        book.submitProof(9, scopeId, seq, 1, 1, PROOF, "");
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.ScopeNotOpen.selector, id, 9));
        book.submitProof(id, 9, seq, 1, 1, PROOF, "");
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.UnknownRoot.selector, id, 9));
        book.submitProof(id, scopeId, 9, 1, 1, PROOF, "");
        uint256 field = book.FIELD();
        vm.expectRevert(ZekroGroupBook.InputOutOfRange.selector);
        book.submitProof(id, scopeId, seq, field, 1, PROOF, "");
        vm.expectRevert(ZekroGroupBook.InputOutOfRange.selector);
        book.submitProof(id, scopeId, seq, 1, uint256(1) << 248, PROOF, "");
        bytes memory longNote = new bytes(257);
        for (uint256 i; i < longNote.length; ++i) longNote[i] = "a";
        vm.expectRevert(ZekroGroupBook.NoteTooLong.selector);
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, string(longNote));
    }

    function test_formingGroupRefusesProofs() public {
        uint256 id = _group();
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Forming));
        book.submitProof(id, 1, 1, 1, 1, PROOF, "");
    }

    function test_pausedGroupRefusesProofsUntilResumed() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        vm.prank(admin);
        book.pauseGroup(id);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.WrongStatus.selector, id, ZekroGroupBook.GroupStatus.Paused));
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, "");
        vm.prank(admin);
        book.resumeGroup(id);
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, "");
    }

    function test_closedAndExpiredScopesRefuseProofs() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        vm.warp(1000);
        vm.prank(admin);
        uint256 timed = book.openScope(id, "timed", 2000);
        book.submitProof(id, timed, seq, 1, 1, PROOF, "");
        vm.warp(2000);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.ScopeExpired.selector, id, timed));
        book.submitProof(id, timed, seq, 2, 1, PROOF, "");
        vm.prank(admin);
        book.closeScope(id, scopeId);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.ScopeNotOpen.selector, id, scopeId));
        book.submitProof(id, scopeId, seq, 3, 1, PROOF, "");
    }

    function test_revokedRootRefused() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        vm.prank(admin);
        book.revokeRoot(id, seq);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.RootIsRevoked.selector, id, seq));
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, "");
    }

    function test_rootLeavesHistoryAfterThirtyTwoNewer() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        vm.startPrank(admin);
        for (uint256 i; i < 31; ++i) book.publishRoot(id, ROOT + 1 + i, _digest(id));
        vm.stopPrank();
        // 32 roots in total: the first is the oldest still accepted.
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, "");
        bytes32 d = _digest(id);
        vm.prank(admin);
        book.publishRoot(id, ROOT + 99, d);
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.RootTooOld.selector, id, seq));
        book.submitProof(id, scopeId, seq, 2, 1, PROOF, "");
        book.submitProof(id, scopeId, seq + 1, 2, 1, PROOF, "");
    }

    // ------------------------------------------------------------------ precheck

    function test_precheckReportsEveryRefusalWithoutState() public {
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        assertEq(uint8(book.precheck(id, scopeId, seq, 1, 1, PROOF)), uint8(ZekroGroupBook.Refusal.None));
        assertEq(book.totalProofs(), 0);
        assertEq(uint8(book.precheck(9, scopeId, seq, 1, 1, PROOF)), uint8(ZekroGroupBook.Refusal.GroupNotActive));
        assertEq(uint8(book.precheck(id, 9, seq, 1, 1, PROOF)), uint8(ZekroGroupBook.Refusal.ScopeNotOpen));
        assertEq(uint8(book.precheck(id, scopeId, 9, 1, 1, PROOF)), uint8(ZekroGroupBook.Refusal.RootUnknown));
        assertEq(uint8(book.precheck(id, scopeId, seq, 1, uint256(1) << 248, PROOF)), uint8(ZekroGroupBook.Refusal.InputOutOfRange));
        book.submitProof(id, scopeId, seq, 1, 1, PROOF, "");
        assertEq(uint8(book.precheck(id, scopeId, seq, 1, 1, PROOF)), uint8(ZekroGroupBook.Refusal.NullifierUsed));
        check.setMode(MockCheck.Mode.Refuse);
        assertEq(uint8(book.precheck(id, scopeId, seq, 2, 1, PROOF)), uint8(ZekroGroupBook.Refusal.ProofRejected));
        check.setMode(MockCheck.Mode.Accept);
        vm.warp(1000);
        vm.prank(admin);
        uint256 timed = book.openScope(id, "t", 2000);
        vm.warp(2000);
        assertEq(uint8(book.precheck(id, timed, seq, 2, 1, PROOF)), uint8(ZekroGroupBook.Refusal.ScopeExpired));
        vm.startPrank(admin);
        for (uint256 i; i < 32; ++i) book.publishRoot(id, ROOT + 1 + i, _digest(id));
        vm.stopPrank();
        assertEq(uint8(book.precheck(id, scopeId, seq, 2, 1, PROOF)), uint8(ZekroGroupBook.Refusal.RootTooOld));
        vm.prank(admin);
        book.revokeRoot(id, seq + 1);
        assertEq(uint8(book.precheck(id, scopeId, seq + 1, 2, 1, PROOF)), uint8(ZekroGroupBook.Refusal.RootRevoked));
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_oneNullifierPerScope(uint256 nullifier, uint256 signal) public {
        nullifier = bound(nullifier, 0, book.FIELD() - 1);
        signal = bound(signal, 0, (uint256(1) << 248) - 1);
        (uint256 id, uint256 seq, uint256 scopeId) = _ready();
        book.submitProof(id, scopeId, seq, nullifier, signal, PROOF, "");
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NullifierUsed.selector, id, scopeId, nullifier));
        book.submitProof(id, scopeId, seq, nullifier, signal, PROOF, "");
    }

    function testFuzz_onlyAuthorisedCurate(address who, uint8 mask) public {
        vm.assume(who != admin);
        mask = uint8(bound(mask, 0, 3));
        uint256 id = _group();
        vm.prank(admin);
        book.setRoles(id, who, mask);
        vm.prank(who);
        if (mask & 1 == 0) vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NotAllowed.selector, id, who, uint8(1)));
        book.addCommitments(id, _one(1));
    }

    function testFuzz_digestFollowsReplay(uint256[6] memory raw) public {
        uint256 id = _group();
        bytes32 d;
        uint32 index;
        vm.startPrank(admin);
        for (uint256 i; i < raw.length; ++i) {
            uint256 c = bound(raw[i], 1, book.FIELD() - 1);
            if (book.isCommitmentSeen(id, c)) continue;
            book.addCommitments(id, _one(c));
            d = keccak256(abi.encode(d, uint8(1), index, c));
            ++index;
        }
        vm.stopPrank();
        assertEq(_digest(id), d);
        assertEq(book.groupOf(id).leafCount, index);
    }
}
