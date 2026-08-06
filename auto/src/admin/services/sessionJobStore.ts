export type SessionJobType = "build" | "filter";
export type SessionJobStatus = "pending" | "running" | "done" | "error";

export interface SessionJobProgress {
  id: string;
  type: SessionJobType;
  status: SessionJobStatus;
  phase: string;
  current: number;
  total: number;
  alive?: number;
  dead?: number;
  detail?: string;
  error?: string;
  result?: unknown;
  startedAt: string;
  finishedAt?: string;
}

const jobs = new Map<string, SessionJobProgress>();
const MAX_JOBS = 20;

function pruneOldJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  for (const job of sorted.slice(0, jobs.size - MAX_JOBS)) {
    jobs.delete(job.id);
  }
}

function newJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSessionJob(type: SessionJobType): SessionJobProgress {
  pruneOldJobs();
  const job: SessionJobProgress = {
    id: newJobId(),
    type,
    status: "pending",
    phase: "Khởi tạo",
    current: 0,
    total: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getSessionJob(id: string): SessionJobProgress | undefined {
  return jobs.get(id);
}

export function getActiveSessionJob(
  type?: SessionJobType
): SessionJobProgress | undefined {
  for (const job of jobs.values()) {
    if (job.status !== "running" && job.status !== "pending") continue;
    if (type && job.type !== type) continue;
    return job;
  }
  return undefined;
}

export function updateSessionJob(
  id: string,
  patch: Partial<Omit<SessionJobProgress, "id" | "type" | "startedAt">>
): SessionJobProgress | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch);
  return job;
}

export function finishSessionJob(
  id: string,
  result: unknown
): SessionJobProgress | undefined {
  return updateSessionJob(id, {
    status: "done",
    phase: "Hoàn thành",
    result,
    finishedAt: new Date().toISOString(),
  });
}

export function failSessionJob(
  id: string,
  error: string
): SessionJobProgress | undefined {
  return updateSessionJob(id, {
    status: "error",
    phase: "Lỗi",
    error,
    finishedAt: new Date().toISOString(),
  });
}
