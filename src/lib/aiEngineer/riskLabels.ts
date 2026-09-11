const RISK_CODES = ["R0", "R1", "R2", "R3", "R4"] as const;

export type RiskCode = (typeof RISK_CODES)[number];

export { RISK_CODES };

export function normalizeRiskCode(risk: string): RiskCode {
  const upper = risk.trim().toUpperCase();
  return (RISK_CODES as readonly string[]).includes(upper) ? (upper as RiskCode) : "R2";
}

export function riskLabelKey(risk: string): string {
  return `aiEngineer.risk.${normalizeRiskCode(risk)}.label`;
}

export function riskDescKey(risk: string): string {
  return `aiEngineer.risk.${normalizeRiskCode(risk)}.desc`;
}
