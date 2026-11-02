// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// The generated UltraHonk verifier for circuits/membership (ZekroMemberCheck).
interface IZekroProofCheck {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @title ZekroGroupBook
/// @notice A public book of membership groups for the Zekro proof studio. Each group has its own admin and
/// roles, a list of commitments, a history of Merkle roots and a set of scopes. A member proves with the
/// membership circuit that a commitment in a published root is theirs, and one nullifier per scope is recorded.
/// @dev What this contract proves and what it does not:
///  - It checks the proof, the root's standing and the nullifier. The statement is exactly the circuit's.
///  - It does not hide the sender. The wallet that submits a proof, its gas and its timing are public.
///  - It cannot hash Poseidon, so it does not recompute a root. A curator publishes the root together with
///    the digest of the commitment list it was built from; anyone can rebuild the tree from the events and
///    compare (the site's review page does this).
/// There is no global owner, fee, pause, or upgrade path. It takes no ETH and holds no tokens.
contract ZekroGroupBook {
    /// Forming: no root yet. Active: proofs accepted. Paused: admin stopped proofs. Retired: final.
    enum GroupStatus {
        Forming,
        Active,
        Paused,
        Retired
    }

    enum ScopeStatus {
        None,
        Open,
        Closed
    }

    /// Why precheck() would refuse a proof, in the order submitProof() tests it.
    enum Refusal {
        None,
        GroupNotActive,
        ScopeNotOpen,
        ScopeExpired,
        RootUnknown,
        RootTooOld,
        RootRevoked,
        InputOutOfRange,
        NullifierUsed,
        ProofRejected
    }

    struct Group {
        address admin;
        GroupStatus status;
        bool openEnrollment;
        uint32 leafCount;
        uint32 rootCount;
        uint32 scopeCount;
        address pendingAdmin;
        uint64 createdAt;
        bytes32 leavesDigest;
    }

    struct RootEntry {
        uint256 root;
        bytes32 leavesDigest;
        uint32 leafCount;
        uint64 publishedAt;
        bool revoked;
    }

    struct Scope {
        ScopeStatus status;
        uint64 closesAt;
        uint32 proofs;
        uint256 field;
    }

    /// BN254 scalar field. Everything the circuit reads must be below it.
    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    /// Tree depth of the circuit is 16.
    uint32 public constant MAX_LEAVES = 65_536;
    /// A root stays usable until this many newer roots exist.
    uint32 public constant ROOT_HISTORY = 32;
    uint256 public constant MAX_BATCH = 128;
    uint256 public constant MAX_NAME = 32;
    uint256 public constant MAX_LABEL = 64;
    uint256 public constant MAX_NOTE = 256;

    /// May add commitments and publish roots.
    uint8 public constant ROLE_CURATOR = 1;
    /// May open and close scopes.
    uint8 public constant ROLE_SCOPE_KEEPER = 2;
    uint8 private constant ROLE_ALL = ROLE_CURATOR | ROLE_SCOPE_KEEPER;

    IZekroProofCheck public immutable CHECKER;

    uint256 public groupCount;
    uint256 public totalCommitments;
    uint256 public totalRoots;
    uint256 public totalProofs;

    mapping(uint256 groupId => Group) private _groups;
    mapping(uint256 groupId => string) private _names;
    mapping(uint256 groupId => mapping(uint256 scopeId => string)) private _labels;
    mapping(uint256 groupId => mapping(address account => uint8 mask)) private _roles;
    mapping(uint256 groupId => mapping(uint256 commitment => bool)) private _seenCommitment;
    mapping(uint256 groupId => mapping(uint256 index => uint256 commitment)) private _leaves;
    mapping(uint256 groupId => mapping(uint256 seq => RootEntry)) private _roots;
    mapping(uint256 groupId => mapping(uint256 scopeId => Scope)) private _scopes;
    mapping(uint256 groupId => mapping(uint256 scopeId => mapping(uint256 nullifier => bool))) private _nullifiers;

    event GroupCreated(uint256 indexed groupId, address indexed admin, string name, bytes32 metadataHash, bool openEnrollment);
    event GroupStatusChanged(uint256 indexed groupId, GroupStatus status);
    event RoleChanged(uint256 indexed groupId, address indexed account, uint8 mask);
    event AdminOffered(uint256 indexed groupId, address indexed admin, address indexed pendingAdmin);
    event AdminChanged(uint256 indexed groupId, address indexed previousAdmin, address indexed admin);
    event CommitmentAdded(uint256 indexed groupId, uint256 indexed index, uint256 commitment, bytes32 leavesDigest);
    event CommitmentCleared(uint256 indexed groupId, uint256 indexed index, uint256 commitment, bytes32 leavesDigest);
    event RootPublished(uint256 indexed groupId, uint256 indexed seq, uint256 root, bytes32 leavesDigest, uint32 leafCount);
    event RootRevoked(uint256 indexed groupId, uint256 indexed seq);
    event ScopeOpened(uint256 indexed groupId, uint256 indexed scopeId, uint256 field, uint64 closesAt, string label);
    event ScopeClosed(uint256 indexed groupId, uint256 indexed scopeId);
    event ProofAccepted(uint256 indexed groupId, uint256 indexed scopeId, uint256 indexed nullifier, uint256 rootSeq, uint256 signal, address sender, string note);

    error CheckerHasNoCode();
    error BadName();
    error BadLabel();
    error NoteTooLong();
    error UnknownGroup(uint256 groupId);
    error UnknownScope(uint256 groupId, uint256 scopeId);
    error NotAdmin(uint256 groupId, address account);
    error NotPendingAdmin(uint256 groupId, address account);
    error NotAllowed(uint256 groupId, address account, uint8 role);
    error BadRole(uint8 mask);
    error ZeroAddress();
    error WrongStatus(uint256 groupId, GroupStatus status);
    error BatchSize(uint256 size);
    error TreeFull(uint256 groupId);
    error BadCommitment(uint256 commitment);
    error CommitmentAlreadyAdded(uint256 groupId, uint256 commitment);
    error UnknownLeaf(uint256 groupId, uint256 index);
    error BadRoot(uint256 root);
    error StaleList(bytes32 given, bytes32 current);
    error UnknownRoot(uint256 groupId, uint256 seq);
    error RootAlreadyRevoked(uint256 groupId, uint256 seq);
    error BadClosingTime(uint64 closesAt);
    error ScopeNotOpen(uint256 groupId, uint256 scopeId);
    error ScopeExpired(uint256 groupId, uint256 scopeId);
    error RootTooOld(uint256 groupId, uint256 seq);
    error RootIsRevoked(uint256 groupId, uint256 seq);
    error InputOutOfRange();
    error NullifierUsed(uint256 groupId, uint256 scopeId, uint256 nullifier);
    error ProofRejected();

    constructor(address checker) {
        if (checker.code.length == 0) revert CheckerHasNoCode();
        CHECKER = IZekroProofCheck(checker);
    }

    // ---------------------------------------------------------------------------------------------
    // Groups, roles
    // ---------------------------------------------------------------------------------------------

    /// @notice Creates a group with the sender as its admin. Ids start at 1.
    function createGroup(string calldata name, bytes32 metadataHash, bool openEnrollment) external returns (uint256 groupId) {
        if (!_printable(name, MAX_NAME)) revert BadName();
        groupId = ++groupCount;
        Group storage g = _groups[groupId];
        g.admin = msg.sender;
        g.openEnrollment = openEnrollment;
        g.createdAt = uint64(block.timestamp);
        _names[groupId] = name;
        emit GroupCreated(groupId, msg.sender, name, metadataHash, openEnrollment);
    }

    /// @notice Sets the full role mask of an account in this group. Zero removes every role.
    function setRoles(uint256 groupId, address account, uint8 mask) external {
        _onlyAdmin(groupId);
        if (account == address(0)) revert ZeroAddress();
        if (mask & ~ROLE_ALL != 0) revert BadRole(mask);
        _roles[groupId][account] = mask;
        emit RoleChanged(groupId, account, mask);
    }

    /// @notice First step of an admin handover. address(0) cancels an offer. A group cannot lose its admin.
    function offerAdmin(uint256 groupId, address next) external {
        _onlyAdmin(groupId);
        _groups[groupId].pendingAdmin = next;
        emit AdminOffered(groupId, msg.sender, next);
    }

    function acceptAdmin(uint256 groupId) external {
        Group storage g = _group(groupId);
        if (g.pendingAdmin != msg.sender) revert NotPendingAdmin(groupId, msg.sender);
        address previous = g.admin;
        g.admin = msg.sender;
        g.pendingAdmin = address(0);
        emit AdminChanged(groupId, previous, msg.sender);
    }

    /// @notice Active to Paused: proofs stop, commitments and roots can still be managed.
    function pauseGroup(uint256 groupId) external {
        Group storage g = _onlyAdmin(groupId);
        if (g.status != GroupStatus.Active) revert WrongStatus(groupId, g.status);
        g.status = GroupStatus.Paused;
        emit GroupStatusChanged(groupId, GroupStatus.Paused);
    }

    function resumeGroup(uint256 groupId) external {
        Group storage g = _onlyAdmin(groupId);
        if (g.status != GroupStatus.Paused) revert WrongStatus(groupId, g.status);
        g.status = GroupStatus.Active;
        emit GroupStatusChanged(groupId, GroupStatus.Active);
    }

    /// @notice Final. A retired group keeps its history and accepts nothing new.
    function retireGroup(uint256 groupId) external {
        Group storage g = _onlyAdmin(groupId);
        if (g.status == GroupStatus.Retired) revert WrongStatus(groupId, g.status);
        g.status = GroupStatus.Retired;
        g.pendingAdmin = address(0);
        emit GroupStatusChanged(groupId, GroupStatus.Retired);
    }

    // ---------------------------------------------------------------------------------------------
    // Commitments, roots
    // ---------------------------------------------------------------------------------------------

    /// @notice Appends commitments. Curators and the admin always; anyone when the group has open enrollment.
    /// The sender of this transaction is public, so a wallet that adds its own commitment links itself to it.
    function addCommitments(uint256 groupId, uint256[] calldata commitments) external {
        Group storage g = _group(groupId);
        if (!g.openEnrollment) _onlyRole(g, groupId, ROLE_CURATOR);
        if (g.status == GroupStatus.Retired) revert WrongStatus(groupId, g.status);
        uint256 size = commitments.length;
        if (size == 0 || size > MAX_BATCH) revert BatchSize(size);
        if (g.leafCount + size > MAX_LEAVES) revert TreeFull(groupId);
        uint32 index = g.leafCount;
        bytes32 digest = g.leavesDigest;
        for (uint256 i; i < size; ++i) {
            uint256 c = commitments[i];
            if (c == 0 || c >= FIELD) revert BadCommitment(c);
            if (_seenCommitment[groupId][c]) revert CommitmentAlreadyAdded(groupId, c);
            _seenCommitment[groupId][c] = true;
            _leaves[groupId][index] = c;
            digest = keccak256(abi.encode(digest, uint8(1), index, c));
            emit CommitmentAdded(groupId, index, c, digest);
            ++index;
        }
        g.leafCount = index;
        g.leavesDigest = digest;
        totalCommitments += size;
    }

    /// @notice Clears one leaf: the tree treats it as empty from the next root on. Earlier roots still contain
    /// it, so a curator should publish a new root and the admin should revoke the earlier ones.
    /// The commitment stays spent for this group and cannot be added again.
    function clearCommitment(uint256 groupId, uint32 index) external {
        Group storage g = _group(groupId);
        _onlyRole(g, groupId, ROLE_CURATOR);
        if (g.status == GroupStatus.Retired) revert WrongStatus(groupId, g.status);
        uint256 commitment = _leaves[groupId][index];
        if (commitment == 0) revert UnknownLeaf(groupId, index);
        _leaves[groupId][index] = 0;
        bytes32 digest = keccak256(abi.encode(g.leavesDigest, uint8(2), index, commitment));
        g.leavesDigest = digest;
        emit CommitmentCleared(groupId, index, commitment, digest);
    }

    /// @notice Publishes the root of the current list. `leavesDigest` must equal the list's digest now, so a root
    /// built from an older list is refused instead of quietly recorded. The first root makes the group Active.
    /// @return seq The root's number in this group, from 1.
    function publishRoot(uint256 groupId, uint256 root, bytes32 leavesDigest) external returns (uint256 seq) {
        Group storage g = _group(groupId);
        _onlyRole(g, groupId, ROLE_CURATOR);
        if (g.status == GroupStatus.Retired) revert WrongStatus(groupId, g.status);
        if (root == 0 || root >= FIELD) revert BadRoot(root);
        if (leavesDigest != g.leavesDigest) revert StaleList(leavesDigest, g.leavesDigest);
        seq = ++g.rootCount;
        _roots[groupId][seq] = RootEntry({root: root, leavesDigest: leavesDigest, leafCount: g.leafCount, publishedAt: uint64(block.timestamp), revoked: false});
        ++totalRoots;
        emit RootPublished(groupId, seq, root, leavesDigest, g.leafCount);
        if (g.status == GroupStatus.Forming) {
            g.status = GroupStatus.Active;
            emit GroupStatusChanged(groupId, GroupStatus.Active);
        }
    }

    /// @notice Stops a root from being used in new proofs. Admin only, cannot be undone.
    function revokeRoot(uint256 groupId, uint256 seq) external {
        _onlyAdmin(groupId);
        RootEntry storage r = _roots[groupId][seq];
        if (r.root == 0) revert UnknownRoot(groupId, seq);
        if (r.revoked) revert RootAlreadyRevoked(groupId, seq);
        r.revoked = true;
        emit RootRevoked(groupId, seq);
    }

    // ---------------------------------------------------------------------------------------------
    // Scopes
    // ---------------------------------------------------------------------------------------------

    /// @notice Opens a scope: one nullifier per member. closesAt 0 means no closing time.
    function openScope(uint256 groupId, string calldata label, uint64 closesAt) external returns (uint256 scopeId) {
        Group storage g = _group(groupId);
        _onlyRole(g, groupId, ROLE_SCOPE_KEEPER);
        if (g.status == GroupStatus.Retired) revert WrongStatus(groupId, g.status);
        if (!_printable(label, MAX_LABEL)) revert BadLabel();
        if (closesAt != 0 && closesAt <= block.timestamp) revert BadClosingTime(closesAt);
        scopeId = ++g.scopeCount;
        uint256 field = scopeField(groupId, scopeId);
        _scopes[groupId][scopeId] = Scope({status: ScopeStatus.Open, closesAt: closesAt, proofs: 0, field: field});
        _labels[groupId][scopeId] = label;
        emit ScopeOpened(groupId, scopeId, field, closesAt, label);
    }

    function closeScope(uint256 groupId, uint256 scopeId) external {
        Group storage g = _group(groupId);
        _onlyRole(g, groupId, ROLE_SCOPE_KEEPER);
        Scope storage s = _scopes[groupId][scopeId];
        if (s.status == ScopeStatus.None) revert UnknownScope(groupId, scopeId);
        if (s.status != ScopeStatus.Open) revert ScopeNotOpen(groupId, scopeId);
        s.status = ScopeStatus.Closed;
        emit ScopeClosed(groupId, scopeId);
    }

    /// @notice The scope value a proof must carry: tied to this chain, this contract, this group and this scope,
    /// so a proof made for one scope is worthless in any other. 248 bits, always below the field.
    function scopeField(uint256 groupId, uint256 scopeId) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), groupId, scopeId))) >> 8;
    }

    // ---------------------------------------------------------------------------------------------
    // Proofs
    // ---------------------------------------------------------------------------------------------

    /// @notice Records a proof. Any wallet may send it; that wallet stays visible on chain.
    /// @param signal 248-bit value the proof is tied to (keccak of the member's message, shifted right by 8).
    /// @param note Optional plain text for the event, not part of the proof. Check it against the signal.
    function submitProof(uint256 groupId, uint256 scopeId, uint256 rootSeq, uint256 nullifier, uint256 signal, bytes calldata proof, string calldata note) external {
        if (bytes(note).length > MAX_NOTE) revert NoteTooLong();
        Group storage g = _group(groupId);
        if (g.status != GroupStatus.Active) revert WrongStatus(groupId, g.status);
        Scope storage s = _scopes[groupId][scopeId];
        if (s.status != ScopeStatus.Open) revert ScopeNotOpen(groupId, scopeId);
        if (s.closesAt != 0 && block.timestamp >= s.closesAt) revert ScopeExpired(groupId, scopeId);
        RootEntry storage r = _roots[groupId][rootSeq];
        if (r.root == 0) revert UnknownRoot(groupId, rootSeq);
        if (rootSeq + ROOT_HISTORY <= g.rootCount) revert RootTooOld(groupId, rootSeq);
        if (r.revoked) revert RootIsRevoked(groupId, rootSeq);
        if (nullifier >= FIELD || signal >> 248 != 0) revert InputOutOfRange();
        if (_nullifiers[groupId][scopeId][nullifier]) revert NullifierUsed(groupId, scopeId, nullifier);
        if (!_check(proof, r.root, s.field, nullifier, signal)) revert ProofRejected();
        _nullifiers[groupId][scopeId][nullifier] = true;
        ++s.proofs;
        ++totalProofs;
        emit ProofAccepted(groupId, scopeId, nullifier, rootSeq, signal, msg.sender, note);
    }

    /// @notice The same tests as submitProof, as a read. Reports the first failing test instead of reverting.
    function precheck(uint256 groupId, uint256 scopeId, uint256 rootSeq, uint256 nullifier, uint256 signal, bytes calldata proof) external view returns (Refusal) {
        Group storage g = _groups[groupId];
        if (g.status != GroupStatus.Active || g.admin == address(0)) return Refusal.GroupNotActive;
        Scope storage s = _scopes[groupId][scopeId];
        if (s.status != ScopeStatus.Open) return Refusal.ScopeNotOpen;
        if (s.closesAt != 0 && block.timestamp >= s.closesAt) return Refusal.ScopeExpired;
        RootEntry storage r = _roots[groupId][rootSeq];
        if (r.root == 0) return Refusal.RootUnknown;
        if (rootSeq + ROOT_HISTORY <= g.rootCount) return Refusal.RootTooOld;
        if (r.revoked) return Refusal.RootRevoked;
        if (nullifier >= FIELD || signal >> 248 != 0) return Refusal.InputOutOfRange;
        if (_nullifiers[groupId][scopeId][nullifier]) return Refusal.NullifierUsed;
        return _check(proof, r.root, s.field, nullifier, signal) ? Refusal.None : Refusal.ProofRejected;
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function groupOf(uint256 groupId) external view returns (Group memory) {
        return _groups[groupId];
    }

    function nameOf(uint256 groupId) external view returns (string memory) {
        return _names[groupId];
    }

    function labelOf(uint256 groupId, uint256 scopeId) external view returns (string memory) {
        return _labels[groupId][scopeId];
    }

    /// A page of the list, so anyone can rebuild the tree from state alone. Zero marks a cleared leaf.
    function leavesPage(uint256 groupId, uint256 start, uint256 count) external view returns (uint256[] memory page) {
        uint256 total = _groups[groupId].leafCount;
        if (start >= total) return new uint256[](0);
        if (count > MAX_BATCH * 2) count = MAX_BATCH * 2;
        uint256 size = total - start < count ? total - start : count;
        page = new uint256[](size);
        for (uint256 i; i < size; ++i) page[i] = _leaves[groupId][start + i];
    }

    function rootOf(uint256 groupId, uint256 seq) external view returns (RootEntry memory) {
        return _roots[groupId][seq];
    }

    function scopeOf(uint256 groupId, uint256 scopeId) external view returns (Scope memory) {
        return _scopes[groupId][scopeId];
    }

    function rolesOf(uint256 groupId, address account) external view returns (uint8) {
        return _roles[groupId][account];
    }

    function isNullifierUsed(uint256 groupId, uint256 scopeId, uint256 nullifier) external view returns (bool) {
        return _nullifiers[groupId][scopeId][nullifier];
    }

    /// The commitment at a leaf index; zero when the index is past the end or the leaf was cleared.
    function leafAt(uint256 groupId, uint256 index) external view returns (uint256) {
        return _leaves[groupId][index];
    }

    function isCommitmentSeen(uint256 groupId, uint256 commitment) external view returns (bool) {
        return _seenCommitment[groupId][commitment];
    }

    // ---------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------

    function _check(bytes calldata proof, uint256 root, uint256 scope, uint256 nullifier, uint256 signal) private view returns (bool) {
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(root);
        inputs[1] = bytes32(scope);
        inputs[2] = bytes32(nullifier);
        inputs[3] = bytes32(signal);
        // The verifier reverts on a malformed or wrong proof; for this contract both mean "not accepted".
        try CHECKER.verify(proof, inputs) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    function _group(uint256 groupId) private view returns (Group storage g) {
        g = _groups[groupId];
        if (g.admin == address(0)) revert UnknownGroup(groupId);
    }

    function _onlyAdmin(uint256 groupId) private view returns (Group storage g) {
        g = _group(groupId);
        if (g.admin != msg.sender) revert NotAdmin(groupId, msg.sender);
    }

    function _onlyRole(Group storage g, uint256 groupId, uint8 role) private view {
        if (g.admin != msg.sender && _roles[groupId][msg.sender] & role == 0) revert NotAllowed(groupId, msg.sender, role);
    }

    /// Non-empty, within `max` bytes, printable ASCII only.
    function _printable(string calldata s, uint256 max) private pure returns (bool) {
        bytes calldata b = bytes(s);
        if (b.length == 0 || b.length > max) return false;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] < 0x20 || b[i] > 0x7e) return false;
        }
        return true;
    }
}
