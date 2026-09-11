import { describe, expect, it } from "vitest";
import { remoteUserFromServerId } from "./targetIdentity";

describe("remoteUserFromServerId", () => {
  it("parses user from server_id", () => {
    expect(remoteUserFromServerId("root@10.0.0.1:22")).toBe("root");
    expect(remoteUserFromServerId("alice@host")).toBe("alice");
  });

  it("returns null when missing", () => {
    expect(remoteUserFromServerId(null)).toBeNull();
    expect(remoteUserFromServerId("")).toBeNull();
    expect(remoteUserFromServerId("no-at-sign")).toBeNull();
  });
});
