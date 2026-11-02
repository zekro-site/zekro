// ZEKRO group membership circuit. The statement, and nothing more:
//
//   "I know a secret and a salt whose commitment is one leaf of the tree with root `root`,
//    `nullifier` is the one value that secret produces for `scope`, and this proof is tied to `signal`."
//
//   commitment = Poseidon2(secret, salt)      (published when the member is added to a group)
//   nullifier  = Poseidon2(secret, scope)     (one value per secret per scope, recorded on chain)
//
// The circuit says nothing about the wallet that sends the proof, the IP it came from, or the
// transaction around it. Those live on other layers and can stay visible.
//
// Poseidon is the circomlib-compatible BN254 instance, shared with poseidon-lite in the browser
// (vectors pinned in the tests of both).

use poseidon::poseidon::bn254::hash_2;

pub global DEPTH: u32 = 16;

fn commitment_of(secret: Field, salt: Field) -> Field {
    hash_2([secret, salt])
}

fn nullifier_of(secret: Field, scope: Field) -> Field {
    hash_2([secret, scope])
}

fn root_of(leaf: Field, path_elements: [Field; DEPTH], path_indices: [Field; DEPTH]) -> Field {
    let mut node = leaf;
    for i in 0..DEPTH {
        let bit = path_indices[i];
        assert(bit * (1 - bit) == 0, "path index is not a bit");
        let sibling = path_elements[i];
        // bit = 0: node is the left child; bit = 1: node is the right child.
        let left = node + bit * (sibling - node);
        let right = sibling + bit * (node - sibling);
        node = hash_2([left, right]);
    }
    node
}

fn main(
    root: pub Field,
    scope: pub Field,
    nullifier: pub Field,
    signal: pub Field,
    secret: Field,
    salt: Field,
    path_elements: [Field; DEPTH],
    path_indices: [Field; DEPTH],
) {
    // Both are 248-bit keccak values; constraining them keeps them real inputs of the statement.
    scope.assert_max_bit_size::<248>();
    signal.assert_max_bit_size::<248>();
    assert(secret != 0, "secret is zero");
    assert(nullifier == nullifier_of(secret, scope), "nullifier mismatch");
    let leaf = commitment_of(secret, salt);
    assert(root_of(leaf, path_elements, path_indices) == root, "not a member of this root");
}

#[test]
fn poseidon_vector() {
    // circomlib reference value, shared with the TypeScript tests.
    assert(hash_2([1, 2]) == 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a);
}

fn empty_path() -> [Field; DEPTH] {
    let mut path = [0; DEPTH];
    let mut z = 0;
    for l in 0..DEPTH {
        path[l] = z;
        z = hash_2([z, z]);
    }
    path
}

#[test]
fn first_and_second_member_prove() {
    let path = empty_path();
    let a = commitment_of(11, 22);
    let b = commitment_of(33, 44);
    let root = root_of(a, path, [0; DEPTH]);
    main(root, 7, nullifier_of(11, 7), 9, 11, 22, path, [0; DEPTH]);
    let mut p1 = path;
    p1[0] = a;
    let mut bits = [0; DEPTH];
    bits[0] = 1;
    let root2 = root_of(b, p1, bits);
    main(root2, 7, nullifier_of(33, 7), 2.pow_32(247) + 5, 33, 44, p1, bits);
}

#[test]
fn nullifier_changes_with_scope_only() {
    assert(nullifier_of(11, 7) != nullifier_of(11, 8));
    assert(nullifier_of(11, 7) != nullifier_of(12, 7));
}

#[test(should_fail_with = "not a member of this root")]
fn rejects_a_stranger() {
    let path = empty_path();
    let root = root_of(commitment_of(11, 22), path, [0; DEPTH]);
    main(root, 7, nullifier_of(12, 7), 9, 12, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "not a member of this root")]
fn rejects_a_wrong_salt() {
    let path = empty_path();
    let root = root_of(commitment_of(11, 22), path, [0; DEPTH]);
    main(root, 7, nullifier_of(11, 7), 9, 11, 23, path, [0; DEPTH]);
}

#[test(should_fail_with = "nullifier mismatch")]
fn rejects_a_chosen_nullifier() {
    let path = empty_path();
    let root = root_of(commitment_of(11, 22), path, [0; DEPTH]);
    main(root, 7, nullifier_of(11, 8), 9, 11, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "secret is zero")]
fn rejects_a_zero_secret() {
    let path = empty_path();
    let root = root_of(commitment_of(0, 22), path, [0; DEPTH]);
    main(root, 7, nullifier_of(0, 7), 9, 0, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "path index is not a bit")]
fn rejects_a_non_bit_index() {
    let path = empty_path();
    let mut bits = [0; DEPTH];
    bits[3] = 2;
    let root = root_of(commitment_of(11, 22), path, [0; DEPTH]);
    main(root, 7, nullifier_of(11, 7), 9, 11, 22, path, bits);
}

#[test(should_fail)]
fn rejects_a_wide_scope() {
    let path = empty_path();
    let wide = 2.pow_32(248);
    let root = root_of(commitment_of(11, 22), path, [0; DEPTH]);
    main(root, wide, nullifier_of(11, wide), 9, 11, 22, path, [0; DEPTH]);
}

#[test(should_fail)]
fn rejects_a_wide_signal() {
    let path = empty_path();
    let root = root_of(commitment_of(11, 22), path, [0; DEPTH]);
    main(root, 7, nullifier_of(11, 7), 2.pow_32(248), 11, 22, path, [0; DEPTH]);
}
