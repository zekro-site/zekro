# Zekro

Zekro is a zero-knowledge proof studio on Robinhood Chain, for communities and developers who need to check that someone belongs to a group without asking who they are. A group keeps a list of commitments instead of names and publishes its Merkle root; a member proves in the browser that one commitment is theirs, without saying which, and anyone can check the proof.

Prove More. Reveal Less. Building a clearer way to review onchain access.

## Read this before anything else

This repository is the working code behind https://zekro.site.

- **A proof proves only the circuit's statement.** It does not make anyone anonymous. Wallet address, IP, network metadata and transaction activity can stay visible through other layers. The wallet that sends a proof on chain is public and stays linked to it.
- **What runs today.** The Noir circuit, proving in a browser worker, checking with the verification key, the review page, and the studio in practice mode, where the proofs are real and the group book is kept in your own browser.
- **What reads live data.** Block height, gas and Chainlink ETH/USD from Robinhood Chain. Groups, roots, scopes and totals from the deployed contract.
- **The contracts are live on Robinhood Chain with verified source.** The studio writes to the book through your wallet; no relayer is involved, so the sending wallet stays visible.
- **Planned and not built:** hosted proving, a developer API, and utility for $ZEKRO.
- **What nothing here claims.** No safety guarantee and no promised value for $ZEKRO. No outside firm has examined this code. A group is only as fair as its admin, and a curator states its root; the review page rebuilds the tree so you can compare.

## Layout

| Path | What it is |
|---|---|
| `circuits/` | The Noir membership circuit and `build.sh`, which rebuilds it and its Solidity verifier. |
| `contracts/` | Solidity sources (`src/`) and Foundry tests (`test/`): the group book and the generated verifier. |
| `src/app/` | Pages and API routes (Next.js App Router). |
| `src/components/` | Interface components: studio, proving lab, verify, review, stats, wallet. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `contracts.ts` (deployed addresses), `assets.ts` (image paths). |
| `src/lib/zk/` | Hashes, tree, witness, bundles, and the prover worker. |
| `src/lib/` | Practice book, chain reads, verdict rules, read relay rules, rate limits. |
| `scripts/` | Prover bundling, contract artifacts and `verify-deployment`. |
| `public/` | Images, wallet logos, the compiled circuit and public proving parameters (`public/zk/`). |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/). The end-to-end suite proves with the site's own TypeScript prover, so run `npm install` first:

```
cd contracts
bash setup.sh
forge test
```

The circuit has its own tests, with [nargo](https://noir-lang.org/) 1.0.0-beta.22:

```
cd circuits/membership
nargo test
```

### What was checked for this snapshot

2 November 2026, Node.js 25.8.2, forge 1.5.1, nargo 1.0.0-beta.22, bb 5.0.0-nightly.20260522:

- `npm run typecheck` exit 0, `npm test` 55 pass, 0 fail, `npm run build` 19 routes and files.
- `forge test` 50 passed, 0 failed: 44 unit and fuzz tests, 4 invariant tests, and 2 end-to-end tests that make real proofs with the site's TypeScript prover and check them with the real verifier.
- `nargo test` 10 passed. `bash circuits/build.sh --check` reports that the verifier and the circuit artifact match a fresh build.
- In a real Chrome, against a local chain with chain id 4663 and the 24 KB size limit: proofs made in the browser worker (1.4 s on the desktop machine used, 8,384 bytes), the studio from identity to accepted proof through an injected wallet, and refusal of a second proof in one scope, a revoked root, a reverted transaction and a text that does not match the signal. Those browser scripts are not part of this repository.
- Measured on that local chain: deployment 1,396,146 + 1,797,257 + 3,937,576 + 2,530,525 gas (9,661,504 in all), one accepted proof about 2.64 million gas.

Deployed to Robinhood Chain on 2 Nov 2026: `npm run verify-deployment` prints MATCH for every contract and Blockscout shows the source as verified. Not run: no proof has been sent to the live book yet, so accepted proofs were only measured on the local chain. Slow phones were not measured.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6030. Everything works with no configuration: proving, checking, the review page and the studio, which reads the deployed book. Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (32 hex characters) the wallet dialog shows WalletConnect as not configured; browser wallets still connect.

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| ZekroFiatShamirTape (verifier library) | `0xf0c55c1ebc96ca21fe949078e8b76f153522fc7d` | [Blockscout](https://robinhoodchain.blockscout.com/address/0xf0c55c1ebc96ca21fe949078e8b76f153522fc7d?tab=contract) |
| ZekroGateRelations (verifier library) | `0xd5347e614f9f95b38653d235d6baf59676147598` | [Blockscout](https://robinhoodchain.blockscout.com/address/0xd5347e614f9f95b38653d235d6baf59676147598?tab=contract) |
| ZekroMemberCheck (verifier) | `0xd1cb32482ff03b79251e4fc4b7eedc493555dd3e` | [Blockscout](https://robinhoodchain.blockscout.com/address/0xd1cb32482ff03b79251e4fc4b7eedc493555dd3e?tab=contract) |
| ZekroGroupBook | `0x3efe3bf22abfead607c75fba4b3086026fc66dae` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x3efe3bf22abfead607c75fba4b3086026fc66dae?tab=contract) |

`ZekroGroupBook` records groups: one admin and two roles per group, a status machine (Forming, Active, Paused, Retired), commitments, the newest 32 usable roots, scopes, and one nullifier per scope. It has no global owner, no fee and no upgrade path, and it holds no funds. `ZekroMemberCheck` is generated from `circuits/membership` by Barretenberg; its runtime is 17,987 bytes, under the 24,576 byte limit. To rebuild both and compare them with what is committed, run `bash circuits/build.sh --check`.

## Verify a deployment

```
npm run verify-deployment -- <book address> --tx <creation tx hash> --kind ZekroGroupBook
```

The script compares the bytecode on Robinhood Chain with the build in this repository, walks the verifier and both libraries, and prints MATCH or the first difference.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- Robinhood Chain RPC, through this site's read-only relay (`/api/rpc`) first, then the configured or public endpoint. The relay accepts only the request shapes the site issues and never forwards a signed transaction.
- Chainlink ETH/USD on Robinhood Chain, cached a few seconds on the server.
- GeckoTerminal, for market figures once the token trades. Keyless and optional.
- What does not answer or does not exist yet is shown as "—".
- A verdict on the verify page is computed in your tab, but book state reaches it through a read endpoint. Point the site at your own RPC if you do not want to rely on ours.
- Proving happens on your device. A slow phone may take a long time or run out of memory.

## Token

$ZEKRO is the community token of Zekro on Robinhood Chain. Contract address: announced on https://zekro.site at launch. It has no promised value. Utility inside the studio is planned, not built.

## Deploy your own

Import the repository into a Next.js host (preset Next.js, root `./`). All variables are optional.

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Server reads | https URL |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser reads | https URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared rate limits across instances | https URL, token |
| `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_HOPS`, `CLIENT_IP_HEADER` | Only behind your own proxy, not on Vercel | `1`, number, header name |

After the deploy check that `/` answers 200, `/api/chain` answers JSON, `/zk/prover.js` exists, and the Prove page makes a proof.

Contracts: from `contracts/`, use `forge create` in order `ZekroFiatShamirTape`, `ZekroGateRelations`, `ZekroMemberCheck` (pass both library addresses with `--libraries`), `ZekroGroupBook` (constructor: the verifier's address). Put the addresses and the book's block into `src/config/contracts.ts`, then run `npm run verify-deployment`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases, identity backups and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The circuit, the contracts, the prover, the verdict rules and the API routes are in scope; wallets, RPC providers, explorers and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). `contracts/src/ZekroMemberCheck.sol` is generated by Barretenberg and keeps its Apache-2.0 header. Manrope and Spline Sans Mono are self-hosted under the SIL Open Font License. `public/zk/crs/` holds public parameters from the Ignition ceremony. Wallet logos belong to their projects and are used only to identify the wallet. The Zekro name, logo and artwork belong to the project and are not licensed for reuse as a brand.
