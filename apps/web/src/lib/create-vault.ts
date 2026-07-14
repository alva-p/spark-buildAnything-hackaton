import {
  bytesToHex,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

export type RecipientDraft = { address: string; percentage: string };

export type ValidatedSplit = {
  recipients: Address[];
  sharesBps: number[];
};

export function percentageToBps(value: string) {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (!match) return undefined;

  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bps <= 10_000 ? bps : undefined;
}

export function validateSplit(rows: RecipientDraft[]): ValidatedSplit | string {
  if (rows.length < 2 || rows.length > 10) return "Use 2 to 10 recipients.";

  const recipients: Address[] = [];
  const sharesBps: number[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isAddress(row.address)) return `Recipient ${index + 1} has an invalid address.`;

    const recipient = getAddress(row.address);
    if (recipient === zeroAddress) return `Recipient ${index + 1} cannot be the zero address.`;
    if (seen.has(recipient.toLowerCase())) return "Recipient addresses must be unique.";

    const share = percentageToBps(row.percentage);
    if (!share) return `Recipient ${index + 1} needs a share greater than 0%.`;

    seen.add(recipient.toLowerCase());
    recipients.push(recipient);
    sharesBps.push(share);
  }

  if (sharesBps.reduce((total, share) => total + share, 0) !== 10_000) {
    return "Shares must total exactly 100%.";
  }

  return { recipients, sharesBps };
}

export function randomSalt(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function reportCommitment(platform: string, privateReportId: string, salt: Hex) {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string platform, string privateReportId, bytes32 salt"), [
      platform.trim(),
      privateReportId.trim(),
      salt,
    ]),
  );
}
