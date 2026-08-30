import { describe, expect, it } from "vitest";
import {
  extractCommandTitle,
  sanitizeDisplayCommand,
} from "./commandDisplay";

describe("commandDisplay", () => {
  it("extracts title from comment line", () => {
    expect(extractCommandTitle("# Restart nginx\nsystemctl restart nginx")).toBe(
      "Restart nginx",
    );
  });

  it("strips decorative echo banners", () => {
    const raw = `echo "===== STEP 1 ====="
systemctl status nginx
echo "===== DONE ====="`;
    expect(sanitizeDisplayCommand(raw)).toBe("systemctl status nginx");
  });

  it("preserves real commands with comments removed from display", () => {
    const raw = `# header
apt-get update && apt-get install -y curl`;
    expect(sanitizeDisplayCommand(raw)).toBe(
      "apt-get update && apt-get install -y curl",
    );
  });
});
