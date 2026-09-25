import { describe, expect, it } from "vitest";
import { parseResumeMissBody, ResumeMissError } from "./resumeMiss";

describe("parseResumeMissBody", () => {
  it("parses FastAPI detail envelope", () => {
    const d = parseResumeMissBody({
      detail: {
        error: "resume_miss",
        session_id: "s",
        resume_run_id: "r1",
      },
    });
    expect(d).toEqual({
      error: "resume_miss",
      session_id: "s",
      resume_run_id: "r1",
    });
  });

  it("returns null for other errors", () => {
    expect(parseResumeMissBody({ detail: "boom" })).toBeNull();
  });
});

describe("ResumeMissError", () => {
  it("is identifiable", () => {
    const e = new ResumeMissError("r1");
    expect(e).toBeInstanceOf(ResumeMissError);
    expect(e.resumeRunId).toBe("r1");
  });
});
