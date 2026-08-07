"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionJob = createSessionJob;
exports.getSessionJob = getSessionJob;
exports.getActiveSessionJob = getActiveSessionJob;
exports.updateSessionJob = updateSessionJob;
exports.finishSessionJob = finishSessionJob;
exports.failSessionJob = failSessionJob;
const jobs = new Map();
const MAX_JOBS = 20;
function pruneOldJobs() {
    if (jobs.size <= MAX_JOBS)
        return;
    const sorted = [...jobs.values()].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    for (const job of sorted.slice(0, jobs.size - MAX_JOBS)) {
        jobs.delete(job.id);
    }
}
function newJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function createSessionJob(type) {
    pruneOldJobs();
    const job = {
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
function getSessionJob(id) {
    return jobs.get(id);
}
function getActiveSessionJob(type) {
    for (const job of jobs.values()) {
        if (job.status !== "running" && job.status !== "pending")
            continue;
        if (type && job.type !== type)
            continue;
        return job;
    }
    return undefined;
}
function updateSessionJob(id, patch) {
    const job = jobs.get(id);
    if (!job)
        return undefined;
    Object.assign(job, patch);
    return job;
}
function finishSessionJob(id, result) {
    return updateSessionJob(id, {
        status: "done",
        phase: "Hoàn thành",
        result,
        finishedAt: new Date().toISOString(),
    });
}
function failSessionJob(id, error) {
    return updateSessionJob(id, {
        status: "error",
        phase: "Lỗi",
        error,
        finishedAt: new Date().toISOString(),
    });
}
