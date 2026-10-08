import { describe, expect, it } from "vitest";
import { selectHostGroups } from "./entityLayoutStore";

describe("selectHostGroups", () => {
  it("returns the same empty list when the hosts layout is not loaded", () => {
    const state = { layouts: { hosts: null, k8s: null } };
    expect(selectHostGroups(state)).toBe(selectHostGroups(state));
  });
});
