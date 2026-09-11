#!/usr/bin/env node
/**
 * Ban agent hardcoding smells (AGENTS.md / linux-ai-engineer rules).
 * Scans agent-sidecar/app only. Exit 1 on match.
 *
 * Intent: catch reintroduced task/runtime/year special-cases — not ban
 * legitimate general mechanisms (Today UTC clock, generic "runtimes" wording).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "agent-sidecar", "app");

/** @type {{ id: string, re: RegExp, files?: string[], note: string }[]} */
const RULES = [
  {
    id: "no-which-ollama",
    re: /which\s+ollama/i,
    note: "Do not special-case ollama discovery commands in agent code/prompts",
  },
  {
    id: "no-runtime-slash-list",
    re: /ollama\s*\/\s*sglang|sglang\s*\/\s*ollama|ollama\s*,\s*sglang|sglang\s*,\s*ollama/i,
    note: "Do not list inference runtimes by name; use generic wording",
  },
  {
    id: "no-fresh-search-year-append",
    re: /fresh_search_query|year_append|append_year_to_query/i,
    note: "Forbidden year-append / query-rewrite hardcoding for web_search",
  },
  {
    id: "no-rate-sanitize",
    re: /\brate_sanitize\b/,
    note: "Forbidden answer rewrite that strips tok/s by regex",
  },
  {
    id: "no-cn-year-force-prompt",
    re: /put that year in the web_search|keep web_search recency at year|今年\s*\/\s*最新|最新\s*\/\s*今年/i,
    files: ["agent/prompts.py"],
    note: "Do not force year into queries via Chinese/English cue scripts in prompts",
  },
  {
    id: "no-nemotron-branch-gateway",
    re: /nemotron/i,
    files: ["llm/gateway.py", "paths.py"],
    note: "Do not branch ModelGateway/paths on Nemotron model id",
  },
  {
    id: "no-named-runtimes-in-prompts",
    re: /\b(ollama|sglang|nemotron)\b/i,
    files: ["agent/prompts.py"],
    note: "System prompts must not name specific local runtimes/models",
  },
];

function walkPy(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkPy(p, out);
    else if (ent.isFile() && ent.name.endsWith(".py")) out.push(p);
  }
  return out;
}

function relApp(abs) {
  return path.relative(appRoot, abs).split(path.sep).join("/");
}

function main() {
  if (!fs.existsSync(appRoot)) {
    console.error(`FAIL missing ${appRoot}`);
    process.exit(1);
  }
  const all = walkPy(appRoot);
  const failures = [];

  for (const rule of RULES) {
    const targets = rule.files
      ? rule.files.map((f) => path.join(appRoot, f)).filter((p) => fs.existsSync(p))
      : all;
    for (const file of targets) {
      const text = fs.readFileSync(file, "utf8");
      const m = text.match(rule.re);
      if (!m) continue;
      const idx = text.indexOf(m[0]);
      const line = text.slice(0, Math.max(0, idx)).split(/\n/).length;
      failures.push({
        id: rule.id,
        file: relApp(file),
        line,
        match: m[0].slice(0, 80),
        note: rule.note,
      });
    }
  }

  if (failures.length) {
    console.error("Agent hardcoding ban failed:");
    for (const f of failures) {
      console.error(
        `  FAIL ${f.id}  ${f.file}:${f.line}  matched ${JSON.stringify(f.match)}  — ${f.note}`,
      );
    }
    process.exit(1);
  }
  console.log(`PASS agent-hardcoding-ban (${RULES.length} rules, ${all.length} py files)`);
}

main();
