import { parseAbi } from "viem";

/*
 * ABIs the site needs. BOOK_ABI mirrors contracts/src/ZekroGroupBook.sol (src/lib/abi.test.ts checks it against the
 * compiled artifact so the two cannot drift apart).
 */
export const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

export const FEED_ABI = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);

export const CHECKER_ABI = parseAbi(["function verify(bytes proof, bytes32[] publicInputs) view returns (bool)"]);

const BOOK_FUNCTIONS = [
  "function createGroup(string name, bytes32 metadataHash, bool openEnrollment) returns (uint256 groupId)",
  "function setRoles(uint256 groupId, address account, uint8 mask)",
  "function offerAdmin(uint256 groupId, address next)",
  "function acceptAdmin(uint256 groupId)",
  "function pauseGroup(uint256 groupId)",
  "function resumeGroup(uint256 groupId)",
  "function retireGroup(uint256 groupId)",
  "function addCommitments(uint256 groupId, uint256[] commitments)",
  "function clearCommitment(uint256 groupId, uint32 index)",
  "function publishRoot(uint256 groupId, uint256 root, bytes32 leavesDigest) returns (uint256 seq)",
  "function revokeRoot(uint256 groupId, uint256 seq)",
  "function openScope(uint256 groupId, string label, uint64 closesAt) returns (uint256 scopeId)",
  "function closeScope(uint256 groupId, uint256 scopeId)",
  "function scopeField(uint256 groupId, uint256 scopeId) view returns (uint256)",
  "function submitProof(uint256 groupId, uint256 scopeId, uint256 rootSeq, uint256 nullifier, uint256 signal, bytes proof, string note)",
  "function precheck(uint256 groupId, uint256 scopeId, uint256 rootSeq, uint256 nullifier, uint256 signal, bytes proof) view returns (uint8)",
  "struct Group { address admin; uint8 status; bool openEnrollment; uint32 leafCount; uint32 rootCount; uint32 scopeCount; address pendingAdmin; uint64 createdAt; bytes32 leavesDigest; }",
  "struct RootEntry { uint256 root; bytes32 leavesDigest; uint32 leafCount; uint64 publishedAt; bool revoked; }",
  "struct Scope { uint8 status; uint64 closesAt; uint32 proofs; uint256 field; }",
  "function groupOf(uint256 groupId) view returns (Group)",
  "function rootOf(uint256 groupId, uint256 seq) view returns (RootEntry)",
  "function scopeOf(uint256 groupId, uint256 scopeId) view returns (Scope)",
  "function nameOf(uint256 groupId) view returns (string)",
  "function labelOf(uint256 groupId, uint256 scopeId) view returns (string)",
  "function leavesPage(uint256 groupId, uint256 start, uint256 count) view returns (uint256[])",
  "function rolesOf(uint256 groupId, address account) view returns (uint8)",
  "function isNullifierUsed(uint256 groupId, uint256 scopeId, uint256 nullifier) view returns (bool)",
  "function isCommitmentSeen(uint256 groupId, uint256 commitment) view returns (bool)",
  "function leafAt(uint256 groupId, uint256 index) view returns (uint256)",
  "function groupCount() view returns (uint256)",
  "function totalCommitments() view returns (uint256)",
  "function totalRoots() view returns (uint256)",
  "function totalProofs() view returns (uint256)",
  "function CHECKER() view returns (address)",
] as const;

const BOOK_EVENTS = [
  "event GroupCreated(uint256 indexed groupId, address indexed admin, string name, bytes32 metadataHash, bool openEnrollment)",
  "event GroupStatusChanged(uint256 indexed groupId, uint8 status)",
  "event RoleChanged(uint256 indexed groupId, address indexed account, uint8 mask)",
  "event AdminOffered(uint256 indexed groupId, address indexed admin, address indexed pendingAdmin)",
  "event AdminChanged(uint256 indexed groupId, address indexed previousAdmin, address indexed admin)",
  "event CommitmentAdded(uint256 indexed groupId, uint256 indexed index, uint256 commitment, bytes32 leavesDigest)",
  "event CommitmentCleared(uint256 indexed groupId, uint256 indexed index, uint256 commitment, bytes32 leavesDigest)",
  "event RootPublished(uint256 indexed groupId, uint256 indexed seq, uint256 root, bytes32 leavesDigest, uint32 leafCount)",
  "event RootRevoked(uint256 indexed groupId, uint256 indexed seq)",
  "event ScopeOpened(uint256 indexed groupId, uint256 indexed scopeId, uint256 field, uint64 closesAt, string label)",
  "event ScopeClosed(uint256 indexed groupId, uint256 indexed scopeId)",
  "event ProofAccepted(uint256 indexed groupId, uint256 indexed scopeId, uint256 indexed nullifier, uint256 rootSeq, uint256 signal, address sender, string note)",
] as const;

const BOOK_ERRORS = [
  "error CheckerHasNoCode()",
  "error BadName()",
  "error BadLabel()",
  "error NoteTooLong()",
  "error UnknownGroup(uint256 groupId)",
  "error UnknownScope(uint256 groupId, uint256 scopeId)",
  "error NotAdmin(uint256 groupId, address account)",
  "error NotPendingAdmin(uint256 groupId, address account)",
  "error NotAllowed(uint256 groupId, address account, uint8 role)",
  "error BadRole(uint8 mask)",
  "error ZeroAddress()",
  "error WrongStatus(uint256 groupId, uint8 status)",
  "error BatchSize(uint256 size)",
  "error TreeFull(uint256 groupId)",
  "error BadCommitment(uint256 commitment)",
  "error CommitmentAlreadyAdded(uint256 groupId, uint256 commitment)",
  "error UnknownLeaf(uint256 groupId, uint256 index)",
  "error BadRoot(uint256 root)",
  "error StaleList(bytes32 given, bytes32 current)",
  "error UnknownRoot(uint256 groupId, uint256 seq)",
  "error RootAlreadyRevoked(uint256 groupId, uint256 seq)",
  "error BadClosingTime(uint64 closesAt)",
  "error ScopeNotOpen(uint256 groupId, uint256 scopeId)",
  "error ScopeExpired(uint256 groupId, uint256 scopeId)",
  "error RootTooOld(uint256 groupId, uint256 seq)",
  "error RootIsRevoked(uint256 groupId, uint256 seq)",
  "error InputOutOfRange()",
  "error NullifierUsed(uint256 groupId, uint256 scopeId, uint256 nullifier)",
  "error ProofRejected()",
] as const;

export const BOOK_ABI = parseAbi([...BOOK_FUNCTIONS, ...BOOK_EVENTS, ...BOOK_ERRORS]);

export const ALL_ERRORS = BOOK_ABI.filter((x) => x.type === "error");

/** Plain words for each custom error, shown instead of a selector. */
export const ERROR_WORDS: Record<string, string> = {
  BadName: "A group name is 1 to 32 plain characters.",
  BadLabel: "A scope label is 1 to 64 plain characters.",
  NoteTooLong: "The note is longer than 256 bytes.",
  UnknownGroup: "That group does not exist.",
  UnknownScope: "That scope does not exist in this group.",
  NotAdmin: "Only this group's admin can do that.",
  NotPendingAdmin: "This wallet was not offered the admin role of this group.",
  NotAllowed: "This wallet does not hold the role for that in this group.",
  BadRole: "That role does not exist.",
  ZeroAddress: "Enter a real address.",
  WrongStatus: "The group's status does not allow that right now.",
  BatchSize: "Send between 1 and 128 commitments at once.",
  TreeFull: "This group's tree is full (65,536 leaves).",
  BadCommitment: "A commitment must be a nonzero value below the field.",
  CommitmentAlreadyAdded: "That commitment was already added to this group. A cleared one cannot come back.",
  UnknownLeaf: "There is no commitment at that position.",
  BadRoot: "A root must be a nonzero value below the field.",
  StaleList: "The list changed after this root was computed. Compute it again.",
  UnknownRoot: "This group has no root with that number.",
  RootAlreadyRevoked: "That root is already revoked.",
  BadClosingTime: "The closing time must be in the future.",
  ScopeNotOpen: "That scope is not open.",
  ScopeExpired: "That scope has passed its closing time.",
  RootTooOld: "That root is more than 32 roots old. Prove against a newer one.",
  RootIsRevoked: "The group's admin revoked that root. Prove against a newer one.",
  InputOutOfRange: "A public value is outside its range.",
  NullifierUsed: "This identity already proved in this scope. That is what the nullifier is for.",
  ProofRejected: "The verifier rejected this proof.",
};

/** ZekroGroupBook.Refusal, in contract order. */
export const REFUSALS = ["None", "GroupNotActive", "ScopeNotOpen", "ScopeExpired", "RootUnknown", "RootTooOld", "RootRevoked", "InputOutOfRange", "NullifierUsed", "ProofRejected"] as const;
export const REFUSAL_WORDS: Record<(typeof REFUSALS)[number], string> = {
  None: "All checks pass. The contract would accept this proof.",
  GroupNotActive: "The group is not active.",
  ScopeNotOpen: "The scope is not open.",
  ScopeExpired: "The scope has closed by time.",
  RootUnknown: "This group has no such root.",
  RootTooOld: "The root is more than 32 roots old.",
  RootRevoked: "The root was revoked by the group's admin.",
  InputOutOfRange: "A public value is out of range.",
  NullifierUsed: "This nullifier is already recorded in this scope.",
  ProofRejected: "The verifier rejected this proof.",
};

export const GROUP_STATUS = ["Forming", "Active", "Paused", "Retired"] as const;
