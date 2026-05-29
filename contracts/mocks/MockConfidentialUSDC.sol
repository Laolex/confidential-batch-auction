// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @dev Test-only mock for the ERC-7984 confidential token interface used by
///      ConfidentialBatchAuction. Intentionally simplified — no balance enforcement,
///      no access control — purely to exercise the CBA token path in unit tests.
///
///      Key design:
///        confidentialTransferFrom — receives a pre-decoded euint64 handle from the
///          calling contract (CBA decodes in its own context first). Stores it and
///          makes it publicly decryptable so tests can assert the transferred amount.
///        confidentialTransfer — receives a pre-computed payout handle, stores it,
///          makes it publicly decryptable for test assertions on winner/loser payouts.
///        revealLastReceived — helper for tests to trigger public decryption of the
///          last handle stored for a given address.
contract MockConfidentialUSDC is ZamaEthereumConfig {

    // Last encrypted handle received per address (simplified single-slot store)
    mapping(address => euint64) private _last;

    // Plaintext minted balance per address (used by depositFor)
    mapping(address => uint256) public mintedFor;

    event Deposit(address indexed account, uint256 amount);
    event TransferFrom(address indexed from, address indexed to);
    event TransferTo(address indexed to);

    // ─────────────────────────────────────────────────────────────
    // Test setup
    // ─────────────────────────────────────────────────────────────

    /// @notice Mint tokens for a test account. No actual token exists —
    ///         just records that the account has `amount` units available.
    function depositFor(address account, uint256 amount) external returns (bool) {
        mintedFor[account] += amount;
        emit Deposit(account, amount);
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // IConfidentialUSDC — called by ConfidentialBatchAuction
    // ─────────────────────────────────────────────────────────────

    /// @notice Receives a pre-decoded euint64 from CBA (CBA decoded it via
    ///         FHE.fromExternal in its own context before calling here).
    ///         Stores the handle and grants CBA persistent access for pool
    ///         accumulation. Returns the same handle so CBA can use it directly.
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64) {
        FHE.allowThis(amount);
        FHE.allow(amount, from);
        FHE.allow(amount, to);
        FHE.allow(amount, msg.sender); // CBA needs this for pool accumulation

        _last[to] = amount;
        emit TransferFrom(from, to);
        return amount;
    }

    /// @notice Receives a payout handle from CBA. Stores it and makes it
    ///         publicly decryptable so tests can verify winner/loser amounts.
    function confidentialTransfer(address to, euint64 encAmount) external {
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, to);
        FHE.makePubliclyDecryptable(encAmount); // test-only: expose for assertions
        _last[to] = encAmount;
        emit TransferTo(to);
    }

    // ─────────────────────────────────────────────────────────────
    // Test helpers
    // ─────────────────────────────────────────────────────────────

    /// @notice Returns the last euint64 handle stored for an address.
    function lastReceivedHandle(address account) external view returns (euint64) {
        return _last[account];
    }

    /// @notice Makes the last received handle publicly decryptable so tests
    ///         can call fhevm.publicDecrypt on it.
    function revealLastReceived(address account) external {
        require(FHE.toBytes32(_last[account]) != bytes32(0), "No handle stored");
        FHE.makePubliclyDecryptable(_last[account]);
    }
}
