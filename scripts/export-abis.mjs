import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(currentDir, "..");

const artifacts = [
  {
    name: "factoryAbi",
    path: resolve(root, "contracts/out/AuditSplitFactory.sol/AuditSplitFactory.json"),
  },
  {
    name: "vaultAbi",
    path: resolve(root, "contracts/out/AuditSplitVault.sol/AuditSplitVault.json"),
  },
];

const outputPath = resolve(root, "apps/web/src/generated/abis.ts");
await mkdir(dirname(outputPath), { recursive: true });

const declarations = [];
for (const artifact of artifacts) {
  const parsed = JSON.parse(await readFile(artifact.path, "utf8"));
  declarations.push(
    `export const ${artifact.name} = ${JSON.stringify(parsed.abi, null, 2)} as const;`,
  );
}

await writeFile(outputPath, `${declarations.join("\n\n")}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
