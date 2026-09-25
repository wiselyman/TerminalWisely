export type ResumeMissDetail = {
  error: "resume_miss";
  session_id?: string;
  resume_run_id?: string;
};

export class ResumeMissError extends Error {
  readonly resumeRunId: string;

  constructor(resumeRunId: string) {
    super("resume_miss");
    this.name = "ResumeMissError";
    this.resumeRunId = resumeRunId;
  }
}

export function parseResumeMissBody(body: unknown): ResumeMissDetail | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  const src =
    detail && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : (body as Record<string, unknown>);
  if (src.error !== "resume_miss") return null;
  return {
    error: "resume_miss",
    session_id: typeof src.session_id === "string" ? src.session_id : undefined,
    resume_run_id:
      typeof src.resume_run_id === "string" ? src.resume_run_id : undefined,
  };
}
