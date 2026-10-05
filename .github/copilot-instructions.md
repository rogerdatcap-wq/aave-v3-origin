# Repository guidance

## Build, test, and lint

- This is a Foundry Solidity project. The configured compiler is Solidity `0.8.27`, EVM target is Shanghai, and optimizer is enabled (200 runs).
- Run the default test suite with `make test` (`forge test -vvv --no-match-contract DeploymentsGasLimits`). Run all Foundry tests, including deployment gas-limit tests, with `forge test`.
- Run one test file with `forge test --match-path tests/protocol/pool/Pool.Borrow.t.sol -vvv`; narrow further with `--match-test testName`. To select a contract, use `make test-contract filter=ContractName`.
- Build and check contract sizes with `forge build --sizes`.
- Format/lint with `npm run lint` (Prettier, including the Solidity plugin); `npm run lint:fix` formats files. Solidity formatting uses two spaces, single quotes, and a 100-character print width.
- `make coverage` produces the LCOV and HTML coverage reports; it requires `lcov`, `genhtml`, and `wget`. `make app` serves the static read-only explorer; `make app-check` syntax-checks its JavaScript.
- The optional Echidna/Medusa invariant suites use `make echidna`, `make echidna-assert`, `make echidna-explore`, and `make medusa`; see `tests/invariants/README.md` for setup and details.
- The root Makefile includes `.env` when present. Use `.env.example` for the expected variable names; RPC and explorer credentials are not required for ordinary local unit tests.

## Architecture

- `src/contracts/protocol/pool/Pool.sol` is the market’s user-facing Pool implementation, normally used through a proxy registered by `PoolAddressesProvider`. It delegates supply, borrow, repayment, liquidation, and flash-loan behavior to focused libraries in `src/contracts/protocol/libraries/logic/`.
- `PoolStorage.sol` defines the Pool’s persistent storage layout. Preserve storage ordering and proxy/upgrade compatibility when changing it. Shared reserve, user, and eMode state is described by `DataTypes` and bit-packed configuration libraries under `protocol/libraries/{types,configuration}`.
- `PoolConfigurator` and the configuration/ACL contracts manage reserve setup and permissions; tokenization contracts implement aTokens and variable debt tokens. Helpers, rewards, treasury, and misc contracts provide protocol-adjacent functionality.
- `src/contracts/extensions/v3-config-engine/` packages reserve and eMode configuration actions into reusable engines/payloads. `src/contracts/extensions/stata-token/` implements the ERC-4626 static aToken wrappers and factory.
- Tests under `tests/` use Foundry. Shared market deployment and fixture setup live in `tests/utils/TestnetProcedures.sol` and the test base patterns; deployment reports, actors, and addresses are available from the setup fixtures. `tests/invariants/` is a separate actor-based fuzz/property suite, while `tests/gas/` and `tests/deployments/` cover gas and deployment behavior.
- `scripts/` contains deployment scripts. `certora/` has separate formal-verification harnesses and Makefiles for specific properties.
- `app/` is a dependency-free static browser explorer and does not submit transactions.

## Repository conventions

- Keep user-facing Pool entrypoints thin and place protocol operation logic in the existing focused libraries. Reuse the shared types, validation, error selectors, and math/configuration libraries rather than duplicating protocol rules.
- Treat proxy storage layout, initializer/version behavior, Pool and token interfaces, and gas snapshots as compatibility surfaces. Protocol behavior changes should follow the existing Foundry test fixtures and update affected snapshots.
- Tests commonly inherit shared setup from `TestnetProcedures` (or `BaseTest`) and access deployed contracts/assets through its fixture structs. Use the existing setup instead of constructing a second ad-hoc market.
- For significant protocol changes, follow `.github/CONTRIBUTING.md` and discuss a feature request before opening a PR. Functionality changes should include updated gas snapshots. Package release notes use Changesets; major version bumps are not allowed.
- CI uses the shared Aave Foundry lint and test workflows in `.github/workflows/test.yml`; the default Make target excludes `DeploymentsGasLimits`.

## MCP tooling

- An EVM RPC MCP can complement Foundry for inspecting deployments and contract state on local or test networks. Prefer read-only calls and repository-configured RPC endpoints; do not expose RPC credentials or sign, broadcast, or submit transactions unless explicitly requested.
