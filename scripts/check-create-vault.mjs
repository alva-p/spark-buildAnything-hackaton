import assert from "node:assert/strict";
import {
  percentageToBps,
  randomSalt,
  reportCommitment,
  validateSplit,
} from "../apps/web/src/lib/create-vault.ts";
import { parseMonAmount } from "../apps/web/src/lib/vault.ts";

const alice = "0x0000000000000000000000000000000000000001";
const bob = "0x0000000000000000000000000000000000000002";
const valid = validateSplit([
  { address: alice, percentage: "66.67" },
  { address: bob, percentage: "33.33" },
]);

assert.equal(percentageToBps("66.67"), 6_667);
assert.equal(typeof valid, "object");
assert.equal(validateSplit([{ address: alice, percentage: "50" }, { address: alice, percentage: "50" }]), "Recipient addresses must be unique.");
assert.equal(validateSplit([{ address: alice, percentage: "40" }, { address: bob, percentage: "40" }]), "Shares must total exactly 100%.");

const salt = randomSalt();
const commitment = reportCommitment("Example", "private-id", salt);
assert.match(salt, /^0x[\da-f]{64}$/);
assert.match(commitment, /^0x[\da-f]{64}$/);
assert.notEqual(commitment, reportCommitment("Example", "different-id", salt));
assert.equal(parseMonAmount("0.25"), 250_000_000_000_000_000n);
assert.equal(parseMonAmount("0"), "Enter an amount greater than 0 MON.");
assert.equal(parseMonAmount("not-a-number"), "Enter a valid MON amount.");

console.log("web transaction helpers: ok");
