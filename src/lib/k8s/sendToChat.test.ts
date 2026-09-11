import { describe, expect, it } from "vitest";
import {
  k8sErrorChatPrompt,
  k8sHealthChatPrompt,
  k8sLogsChatPrompt,
  k8sSelectionChatPrompt,
  k8sWarningChatPrompt,
  k8sYamlChatPrompt,
} from "./sendToChat";

describe("k8s sendToChat prompts", () => {
  const t = (key: string, vars?: Record<string, string | number>) =>
    `${key}:${JSON.stringify(vars ?? {})}`;

  it("builds warning prompt with reason and message", () => {
    const text = k8sWarningChatPrompt(
      {
        kind: "Pod",
        namespace: "common",
        name: "web-0",
        reason: "Failed",
        message: "ErrImagePull",
      },
      t,
    );
    expect(text).toContain("aiEngineerWarningPrompt");
    expect(text).toContain("Failed");
    expect(text).toContain("ErrImagePull");
    expect(text).toContain("common/web-0");
  });

  it("clips long logs in prompt", () => {
    const logs = "x".repeat(13_000);
    const text = k8sLogsChatPrompt({
      kind: "Pod",
      namespace: "ns",
      name: "p",
      logs,
      t,
    });
    expect(text).toContain("truncated");
    expect(text.length).toBeLessThan(13_000 + 200);
  });

  it("clips long yaml in prompt", () => {
    const yaml = "y".repeat(13_000);
    const text = k8sYamlChatPrompt({
      kind: "Deployment",
      namespace: "ns",
      name: "web",
      yaml,
      t,
    });
    expect(text).toContain("aiEngineerYamlPrompt");
    expect(text).toContain("truncated");
    expect(text.length).toBeLessThan(13_000 + 200);
  });

  it("builds error prompt with operation and message", () => {
    const text = k8sErrorChatPrompt({
      operation: "apply",
      error: "admission webhook denied",
      t,
    });
    expect(text).toContain("aiEngineerErrorPrompt");
    expect(text).toContain("apply");
    expect(text).toContain("admission webhook denied");
  });

  it("aggregates health warnings into prompt", () => {
    const text = k8sHealthChatPrompt({
      warnings: [
        {
          kind: "Pod",
          namespace: "ns",
          name: "a",
          reason: "Failed",
          message: "OOMKilled",
        },
        {
          kind: "Node",
          namespace: "",
          name: "n1",
          reason: "NotReady",
          message: "kubelet down",
        },
      ],
      notReadyNodes: 1,
      t,
    });
    expect(text).toContain("aiEngineerHealthPrompt");
    expect(text).toContain("OOMKilled");
    expect(text).toContain("NotReady");
    expect(text).toContain('"count":2');
  });

  it("clips terminal selection in prompt", () => {
    const text = k8sSelectionChatPrompt({
      source: "cluster-terminal",
      text: "z".repeat(13_000),
      t,
    });
    expect(text).toContain("aiEngineerSelectionPrompt");
    expect(text).toContain("truncated");
    expect(text.length).toBeLessThan(13_000 + 200);
  });
});
