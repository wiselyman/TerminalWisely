/**
 * Fail if AiEngineerPanel references React/store setters that are not declared.
 * Catches bugs like: deleted `const [x, setX] = useState` but left `setX(...)` in effects.
 *
 * Keep in sync with src/lib/aiEngineer/panelSetterHygiene.ts (smoke cannot import TS).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILTIN_FALSE_POSITIVES = new Set([
  "setTimeout",
  "setInterval",
  "setImmediate",
  "setSelectionRange",
]);

function analyzePanelSetters(src) {
  const declared = new Set();
  const useStateRe =
    /const\s*\[\s*[A-Za-z0-9_]+\s*,\s*(set[A-Za-z0-9_]+)\s*(?:,\s*[A-Za-z0-9_]+)?\s*\]\s*=\s*useState/g;
  let m;
  while ((m = useStateRe.exec(src))) declared.add(m[1]);
  const useStateLooseRe =
    /,\s*(set[A-Za-z0-9_]+)\s*\]\s*=\s*\n?\s*useState/g;
  while ((m = useStateLooseRe.exec(src))) declared.add(m[1]);
  const storeSetterRe =
    /const\s+(set[A-Za-z0-9_]+)\s*=\s*use[A-Za-z0-9_]*Store\s*\(/g;
  while ((m = storeSetterRe.exec(src))) declared.add(m[1]);

  const used = new Set();
  const usedRe = /\b(set[A-Z][A-Za-z0-9_]*)\b/g;
  while ((m = usedRe.exec(src))) {
    if (!BUILTIN_FALSE_POSITIVES.has(m[1])) used.add(m[1]);
  }
  const undeclared = [...used].filter((name) => !declared.has(name)).sort();
  return { declared, used, undeclared };
}

function checkAiEngineerPanelHygiene(panelSrc) {
  const { undeclared } = analyzePanelSetters(panelSrc);
  const banned = [];
  if (
    /\bsetApproveForSession\b/.test(panelSrc) &&
    !/,\s*setApproveForSession\s*\]\s*=\s*useState/.test(panelSrc)
  ) {
    banned.push("setApproveForSession referenced without useState declaration");
  }
  for (const tid of [
    "ai-engineer-approval-once",
    "ai-engineer-approval-session",
    "ai-engineer-approval-reject",
  ]) {
    if (!panelSrc.includes(`data-testid="${tid}"`)) {
      banned.push(`missing data-testid="${tid}"`);
    }
  }
  return {
    ok: undeclared.length === 0 && banned.length === 0,
    undeclared,
    banned,
  };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const panelPath = path.join(
  root,
  "src/components/aiEngineer/AiEngineerPanel.tsx",
);
const src = fs.readFileSync(panelPath, "utf8");
const result = checkAiEngineerPanelHygiene(src);
if (!result.ok) {
  console.error("AiEngineerPanel hygiene FAIL");
  if (result.undeclared.length) {
    console.error("  undeclared setters:", result.undeclared.join(", "));
  }
  for (const b of result.banned) console.error(" ", b);
  process.exit(1);
}
console.log("AiEngineerPanel hygiene PASS");
