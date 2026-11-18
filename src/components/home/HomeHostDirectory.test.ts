import { describe, expect, it } from "vitest";
import { buildHomeHostSections } from "./HomeHostDirectory";
import type { SavedConnection } from "../../types";

const host = (id: string, name: string): SavedConnection => ({
  id,
  name,
  username: "ops",
  host: `${name.toLowerCase()}.test`,
  port: 22,
  auth_method: "privatekey",
  has_password: false,
});

describe("Home host directory sections", () => {
  it("keeps Local first and preserves host group and entry order", () => {
    const sections = buildHomeHostSections(
      [
        { key: "ops", name: "Operations", hostIds: ["host-b", "host-a"] },
        { key: "__ungrouped__", name: "Ungrouped", hostIds: ["host-c"] },
      ],
      [
        host("host-a", "Alpha"),
        host("host-b", "Beta"),
        host("host-c", "Gamma"),
      ],
    );

    expect(sections).toEqual([
      { key: "local", name: "Local", local: true, hosts: [] },
      {
        key: "ops",
        name: "Operations",
        local: false,
        hosts: [
          host("host-b", "Beta"),
          host("host-a", "Alpha"),
        ],
      },
      {
        key: "__ungrouped__",
        name: "Ungrouped",
        local: false,
        hosts: [host("host-c", "Gamma")],
      },
    ]);
  });

  it("shows the Local section when there are no saved hosts", () => {
    expect(buildHomeHostSections([], [])).toEqual([
      { key: "local", name: "Local", local: true, hosts: [] },
    ]);
  });
});
