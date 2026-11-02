// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Answers what it is told, records nothing. Stands in for the verifier in the unit tests only;
/// ZekroGroupBook.e2e.t.sol uses the real one.
contract MockCheck {
    enum Mode {
        Accept,
        Refuse,
        Revert
    }

    Mode public mode;
    bytes32[] public lastInputs;

    function setMode(Mode m) external {
        mode = m;
    }

    function verify(bytes calldata, bytes32[] calldata inputs) external view returns (bool) {
        inputs;
        if (mode == Mode.Revert) revert("bad proof");
        return mode == Mode.Accept;
    }
}

/// Checks the exact public inputs the book hands to the verifier.
contract StrictCheck {
    bytes32 public root;
    bytes32 public scope;
    bytes32 public nullifier;
    bytes32 public signal;

    function expect(bytes32 r, bytes32 s, bytes32 n, bytes32 g) external {
        root = r;
        scope = s;
        nullifier = n;
        signal = g;
    }

    function verify(bytes calldata, bytes32[] calldata inputs) external view returns (bool) {
        return inputs.length == 4 && inputs[0] == root && inputs[1] == scope && inputs[2] == nullifier && inputs[3] == signal;
    }
}
