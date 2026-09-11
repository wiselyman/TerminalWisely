import { describe, expect, it } from "vitest";
import {
  analyzePanelSetters,
  checkAiEngineerPanelHygiene,
} from "../../lib/aiEngineer/panelSetterHygiene";

describe("panelSetterHygiene", () => {
  it("passes when setters are declared via useState", () => {
    const src = `
      const [approvePermanently, setApprovePermanently] = useState(false);
      const [showApprovalAdvanced, setShowApprovalAdvanced] = useState(false);
      useEffect(() => {
        setApprovePermanently(false);
        setShowApprovalAdvanced(false);
      }, []);
      data-testid="ai-engineer-approval-once"
      data-testid="ai-engineer-approval-session"
      data-testid="ai-engineer-approval-reject"
    `;
    expect(analyzePanelSetters(src).undeclared).toEqual([]);
    expect(checkAiEngineerPanelHygiene(src).ok).toBe(true);
  });

  it("fails when setApproveForSession is used without useState (shipped crash)", () => {
    const src = `
      const [approvePermanently, setApprovePermanently] = useState(false);
      useEffect(() => {
        setApproveForSession(true);
        setApprovePermanently(false);
      }, []);
      data-testid="ai-engineer-approval-once"
      data-testid="ai-engineer-approval-session"
      data-testid="ai-engineer-approval-reject"
    `;
    const result = checkAiEngineerPanelHygiene(src);
    expect(result.ok).toBe(false);
    expect(
      result.undeclared.includes("setApproveForSession") ||
        result.banned.some((b) => b.includes("setApproveForSession")),
    ).toBe(true);
  });

  it("fails when once/session/reject testids missing", () => {
    const src = `
      const [x, setX] = useState(0);
      setX(1);
    `;
    const result = checkAiEngineerPanelHygiene(src);
    expect(result.ok).toBe(false);
    expect(result.banned.length).toBeGreaterThan(0);
  });
});
