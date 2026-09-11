import { describe, expect, it } from "vitest";
import { parsePodVolumes } from "./podVolumes";

const podJson = JSON.stringify({
  apiVersion: "v1",
  kind: "Pod",
  spec: {
    containers: [
      {
        name: "app",
        volumeMounts: [
          { name: "data", mountPath: "/data" },
          { name: "cfg", mountPath: "/etc/cfg" },
        ],
      },
    ],
    volumes: [
      {
        name: "data",
        persistentVolumeClaim: { claimName: "data-pvc" },
      },
      { name: "cfg", configMap: { name: "app-cfg" } },
      { name: "tmp", emptyDir: {} },
      { name: "cache", emptyDir: {} },
      { name: "sa", projected: { sources: [] } },
    ],
  },
});

describe("parsePodVolumes", () => {
  it("groups pod volumes from JSON with mounts and claimName", () => {
    const groups = parsePodVolumes(podJson);
    expect(groups.map((g) => [g.typeKey, g.volumes.length])).toEqual([
      ["persistentVolumeClaim", 1],
      ["configMap", 1],
      ["emptyDir", 2],
      ["projected", 1],
    ]);
    const pvc = groups[0].volumes[0];
    expect(pvc).toMatchObject({
      name: "data",
      claimName: "data-pvc",
      mountPaths: ["/data"],
    });
  });

  it("parses kubectl-style YAML volumes", () => {
    const yaml = `
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: data-pvc
  - name: tmp
    emptyDir: {}
`;
    const groups = parsePodVolumes(yaml);
    expect(groups).toHaveLength(2);
    expect(groups[0].typeKey).toBe("persistentVolumeClaim");
    expect(groups[0].volumes[0].claimName).toBe("data-pvc");
    expect(groups[0].volumes[0].mountPaths).toContain("/data");
    expect(groups[1].typeKey).toBe("emptyDir");
  });

  it("returns empty for missing volumes or bad docs", () => {
    expect(parsePodVolumes("")).toEqual([]);
    expect(parsePodVolumes("{not-json")).toEqual([]);
    expect(parsePodVolumes(JSON.stringify({ spec: {} }))).toEqual([]);
  });
});
