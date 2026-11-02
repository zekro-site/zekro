// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ZekroGroupBook} from "../src/ZekroGroupBook.sol";
import {MockCheck} from "./Mocks.sol";

/// Drives the book through random valid and invalid actions by a few wallets.
contract BookHandler is Test {
    ZekroGroupBook public book;
    address[] public actors;
    uint256[] public groups;
    uint256 public accepted;
    uint256 public added;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint256))) public timesRecorded;
    mapping(uint256 => bool) public everRetired;

    constructor(ZekroGroupBook b) {
        book = b;
        actors.push(makeAddr("a"));
        actors.push(makeAddr("b"));
        actors.push(makeAddr("c"));
    }

    function groupsLength() external view returns (uint256) {
        return groups.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        if (groups.length == 0) return 1;
        return groups[seed % groups.length];
    }

    function create(uint256 who, bool open) external {
        vm.prank(_actor(who));
        groups.push(book.createGroup("g", 0, open));
    }

    function add(uint256 who, uint256 g, uint256 c) external {
        uint256 id = _pick(g);
        c = bound(c, 1, 50);
        vm.prank(_actor(who));
        try book.addCommitments(id, _one(c)) {
            ++added;
        } catch {}
    }

    function clear(uint256 who, uint256 g, uint32 index) external {
        uint256 id = _pick(g);
        vm.prank(_actor(who));
        try book.clearCommitment(id, index % 8) {} catch {}
    }

    function publish(uint256 who, uint256 g, uint256 root) external {
        uint256 id = _pick(g);
        root = bound(root, 1, 1000);
        bytes32 d = book.groupOf(id).leavesDigest;
        vm.prank(_actor(who));
        try book.publishRoot(id, root, d) {} catch {}
    }

    function open(uint256 who, uint256 g) external {
        uint256 id = _pick(g);
        vm.prank(_actor(who));
        try book.openScope(id, "s", 0) {} catch {}
    }

    function setState(uint256 who, uint256 g, uint8 what) external {
        uint256 id = _pick(g);
        vm.startPrank(_actor(who));
        what = what % 8;
        if (what == 0) try book.pauseGroup(id) {} catch {}
        else if (what == 1) try book.resumeGroup(id) {} catch {}
        else if (what == 2) {
            try book.retireGroup(id) {
                everRetired[id] = true;
            } catch {}
        } else if (what == 3) try book.offerAdmin(id, _actor(who + 1)) {} catch {}
        else if (what == 4) try book.acceptAdmin(id) {} catch {}
        else if (what == 5) try book.setRoles(id, _actor(who + 1), what % 4) {} catch {}
        else try book.revokeRoot(id, 1) {} catch {}
        vm.stopPrank();
    }

    function submit(uint256 who, uint256 g, uint256 scopeId, uint256 seq, uint256 nullifier) external {
        uint256 id = _pick(g);
        scopeId = bound(scopeId, 1, 4);
        seq = bound(seq, 1, 4);
        nullifier = bound(nullifier, 0, 20);
        vm.prank(_actor(who));
        try book.submitProof(id, scopeId, seq, nullifier, 1, hex"00", "") {
            ++accepted;
            ++timesRecorded[id][scopeId][nullifier];
        } catch {}
    }

    function _one(uint256 c) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = c;
    }
}

contract ZekroGroupBookInvariant is Test {
    ZekroGroupBook book;
    BookHandler handler;

    function setUp() public {
        book = new ZekroGroupBook(address(new MockCheck()));
        handler = new BookHandler(book);
        targetContract(address(handler));
    }

    /// Accepted proofs and commitments are all counted, nothing else moves the totals.
    function invariant_totalsMatchAcceptedActions() public view {
        assertEq(book.totalProofs(), handler.accepted());
        assertEq(book.totalCommitments(), handler.added());
    }

    /// Every group always has an admin, and a retired group stays retired.
    function invariant_groupsKeepAnAdminAndRetiredIsFinal() public view {
        uint256 n = handler.groupsLength();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.groups(i);
            ZekroGroupBook.Group memory g = book.groupOf(id);
            assertTrue(g.admin != address(0));
            if (handler.everRetired(id)) assertEq(uint8(g.status), uint8(ZekroGroupBook.GroupStatus.Retired));
            assertLe(g.leafCount, book.MAX_LEAVES());
        }
    }

    /// A nullifier is recorded at most once per scope.
    function invariant_oneNullifierPerScope() public view {
        uint256 n = handler.groupsLength();
        for (uint256 i; i < n && i < 6; ++i) {
            uint256 id = handler.groups(i);
            for (uint256 s = 1; s <= 4; ++s) {
                for (uint256 v; v <= 20; ++v) assertLe(handler.timesRecorded(id, s, v), 1);
            }
        }
    }

    /// The book never holds ether.
    function invariant_holdsNothing() public view {
        assertEq(address(book).balance, 0);
    }
}
