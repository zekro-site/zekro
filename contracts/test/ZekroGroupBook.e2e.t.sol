// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ZekroGroupBook} from "../src/ZekroGroupBook.sol";
import {ZekroMemberCheck} from "../src/ZekroMemberCheck.sol";

/// End to end: a group in the book, a proof made by the site's TypeScript prover (test/ffi/prove.mts through
/// vm.ffi), checked by the real UltraHonk verifier. Run after circuits/build.sh.
contract ZekroGroupBookE2E is Test {
    uint256 constant SECRET = 0x0badc0ffee0badc0ffee0badc0ffee0badc0ffee0badc0ffee0badc0ffee01;
    uint256 constant SALT = 0x05ec7e705ec7e705ec7e705ec7e705ec7e705ec7e705ec7e705ec7e705ec702;
    uint256 constant SIGNAL = 0x7777;

    ZekroGroupBook book;
    ZekroMemberCheck checker;
    address admin = makeAddr("admin");
    address sender = makeAddr("sender");
    uint256[] leaves;

    function setUp() public {
        checker = new ZekroMemberCheck();
        book = new ZekroGroupBook(address(checker));
    }

    function _ffi(string memory cmd, string memory json) internal returns (bytes memory) {
        string[] memory c = new string[](6);
        c[0] = "npx";
        c[1] = "tsx";
        c[2] = "test/ffi/prove.mts";
        c[3] = cmd;
        c[4] = json;
        c[5] = "";
        return vm.ffi(c);
    }

    function _hash(uint256 a, uint256 b) internal returns (uint256) {
        return uint256(bytes32(_ffi("commit", string.concat('{"a":"', vm.toString(bytes32(a)), '","b":"', vm.toString(bytes32(b)), '"}'))));
    }

    function _prove(uint256 secret, uint256 salt, uint256 scope, uint256 signal) internal returns (bytes memory proof, uint256 root, uint256 nullifier) {
        string memory list = "[";
        for (uint256 i; i < leaves.length; i++) list = string.concat(list, i == 0 ? "" : ",", '"', vm.toString(bytes32(leaves[i])), '"');
        string memory json = string.concat(
            '{"secret":"',
            vm.toString(bytes32(secret)),
            '","salt":"',
            vm.toString(bytes32(salt)),
            '","scope":"',
            vm.toString(bytes32(scope)),
            '","signal":"',
            vm.toString(bytes32(signal)),
            '","leaves":',
            list,
            "]}"
        );
        return abi.decode(_ffi("prove", json), (bytes, uint256, uint256));
    }

    function _listed(uint256 n) internal {
        for (uint256 i; i < n; ++i) leaves.push(uint256(keccak256(abi.encode("member", i))) >> 8);
        leaves.push(_hash(SECRET, SALT));
    }

    function _one(uint256 c) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = c;
    }

    function test_realProofLifecycle() public {
        _listed(3);
        vm.startPrank(admin);
        uint256 id = book.createGroup("Readers", 0, false);
        book.addCommitments(id, leaves);
        uint256 scopeId = book.openScope(id, "round one", 0);
        vm.stopPrank();
        uint256 scope = book.scopeField(id, scopeId);
        (bytes memory proof, uint256 root, uint256 nullifier) = _prove(SECRET, SALT, scope, SIGNAL);

        bytes32 digest = book.groupOf(id).leavesDigest;
        vm.prank(admin);
        uint256 seq = book.publishRoot(id, root, digest);

        // The read path agrees before anything is sent.
        assertEq(uint8(book.precheck(id, scopeId, seq, nullifier, SIGNAL, proof)), uint8(ZekroGroupBook.Refusal.None));

        // Each public input is really bound: changing any one of them fails the real verifier.
        assertEq(uint8(book.precheck(id, scopeId, seq, nullifier ^ 1, SIGNAL, proof)), uint8(ZekroGroupBook.Refusal.ProofRejected));
        assertEq(uint8(book.precheck(id, scopeId, seq, nullifier, SIGNAL ^ 1, proof)), uint8(ZekroGroupBook.Refusal.ProofRejected));

        // A flipped proof byte fails too.
        bytes memory bad = bytes.concat(proof);
        bad[200] = bytes1(uint8(bad[200]) ^ 1);
        assertEq(uint8(book.precheck(id, scopeId, seq, nullifier, SIGNAL, bad)), uint8(ZekroGroupBook.Refusal.ProofRejected));
        // So does a truncated one.
        assertEq(uint8(book.precheck(id, scopeId, seq, nullifier, SIGNAL, hex"00")), uint8(ZekroGroupBook.Refusal.ProofRejected));

        // A proof made for this scope is worthless in another scope of the same group.
        vm.prank(admin);
        uint256 otherScope = book.openScope(id, "round two", 0);
        assertEq(uint8(book.precheck(id, otherScope, seq, nullifier, SIGNAL, proof)), uint8(ZekroGroupBook.Refusal.ProofRejected));

        uint256 gasBefore = gasleft();
        vm.prank(sender);
        book.submitProof(id, scopeId, seq, nullifier, SIGNAL, proof, "");
        console2.log("submitProof gas", gasBefore - gasleft());
        console2.log("proof bytes", proof.length);
        assertTrue(book.isNullifierUsed(id, scopeId, nullifier));

        // The same member cannot prove twice in one scope.
        vm.expectRevert(abi.encodeWithSelector(ZekroGroupBook.NullifierUsed.selector, id, scopeId, nullifier));
        book.submitProof(id, scopeId, seq, nullifier, SIGNAL, proof, "");
    }

    function test_clearedMemberCannotUseTheNewRoot() public {
        _listed(1);
        vm.startPrank(admin);
        uint256 id = book.createGroup("Readers", 0, false);
        book.addCommitments(id, leaves);
        uint256 scopeId = book.openScope(id, "round", 0);
        vm.stopPrank();
        uint256 scope = book.scopeField(id, scopeId);
        (bytes memory proof, uint256 root, uint256 nullifier) = _prove(SECRET, SALT, scope, SIGNAL);

        vm.startPrank(admin);
        uint256 oldSeq = book.publishRoot(id, root, book.groupOf(id).leavesDigest);
        book.clearCommitment(id, uint32(leaves.length - 1));
        // Any other root: the proof was made against the old one and does not hold.
        uint256 newSeq = book.publishRoot(id, root ^ 1, book.groupOf(id).leavesDigest);
        book.revokeRoot(id, oldSeq);
        vm.stopPrank();

        assertEq(uint8(book.precheck(id, scopeId, oldSeq, nullifier, SIGNAL, proof)), uint8(ZekroGroupBook.Refusal.RootRevoked));
        assertEq(uint8(book.precheck(id, scopeId, newSeq, nullifier, SIGNAL, proof)), uint8(ZekroGroupBook.Refusal.ProofRejected));
    }
}
