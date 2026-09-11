/** Static hygiene for AiEngineerPanel — catch deleted useState leftovers. */

const BUILTIN_FALSE_POSITIVES = new Set([
  "setTimeout",
  "setInterval",
  "setImmediate",
  "setSelectionRange",
]);

export function analyzePanelSetters(src: string): {
  declared: Set<string>;
  used: Set<string>;
  undeclared: string[];
} {
  const declared = new Set<string>();

  const useStateRe =
    /const\s*\[\s*[A-Za-z0-9_]+\s*,\s*(set[A-Za-z0-9_]+)\s*(?:,\s*[A-Za-z0-9_]+)?\s*\]\s*=\s*useState/g;
  let m: RegExpExecArray | null;
  while ((m = useStateRe.exec(src))) {
    declared.add(m[1]);
  }

  const useStateLooseRe =
    /,\s*(set[A-Za-z0-9_]+)\s*\]\s*=\s*\n?\s*useState/g;
  while ((m = useStateLooseRe.exec(src))) {
    declared.add(m[1]);
  }

  const storeSetterRe =
    /const\s+(set[A-Za-z0-9_]+)\s*=\s*use[A-Za-z0-9_]*Store\s*\(/g;
  while ((m = storeSetterRe.exec(src))) {
    declared.add(m[1]);
  }

  const used = new Set<string>();
  const usedRe = /\b(set[A-Z][A-Za-z0-9_]*)\b/g;
  while ((m = usedRe.exec(src))) {
    const name = m[1];
    if (BUILTIN_FALSE_POSITIVES.has(name)) continue;
    used.add(name);
  }

  const undeclared = [...used].filter((name) => !declared.has(name)).sort();
  return { declared, used, undeclared };
}

export function checkAiEngineerPanelHygiene(panelSrc: string): {
  ok: boolean;
  undeclared: string[];
  banned: string[];
} {
  const { undeclared } = analyzePanelSetters(panelSrc);
  const banned: string[] = [];
  if (
    /\bsetApproveForSession\b/.test(panelSrc) &&
    !/,\s*setApproveForSession\s*\]\s*=\s*useState/.test(panelSrc)
  ) {
    banned.push("setApproveForSession referenced without useState declaration");
  }
  if (!panelSrc.includes('data-testid="ai-engineer-approval-once"')) {
    banned.push('missing data-testid="ai-engineer-approval-once"');
  }
  if (!panelSrc.includes('data-testid="ai-engineer-approval-session"')) {
    banned.push('missing data-testid="ai-engineer-approval-session"');
  }
  if (!panelSrc.includes('data-testid="ai-engineer-approval-reject"')) {
    banned.push('missing data-testid="ai-engineer-approval-reject"');
  }
  return {
    ok: undeclared.length === 0 && banned.length === 0,
    undeclared,
    banned,
  };
}
