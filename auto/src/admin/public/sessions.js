/** Session admin — IIFE tránh trùng API/$ với app.js */
(function () {
  const API = "/api";
  const POLL_MS = 800;

  function $(sel) {
    return document.querySelector(sel);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function sessionApi(path, opts = {}) {
    const res = await fetch(API + "/sessions" + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function setLog(el, msg, isError = false) {
    if (!el) return;
    el.innerHTML = msg;
    el.className = "action-log" + (isError ? " error" : " ok");
  }

  const jobUi = {
    build: {
      panel: "#buildJobPanel",
      badge: "#buildJobBadge",
      fill: "#buildProgressFill",
      meta: "#buildProgressMeta",
      btn: "#btnBuildSessions",
    },
    filter: {
      panel: "#filterJobPanel",
      badge: "#filterJobBadge",
      fill: "#filterProgressFill",
      meta: "#filterProgressMeta",
      btn: "#btnFilterSessions",
    },
  };

  function renderJobUi(type, job) {
    const ui = jobUi[type];
    const panel = $(ui.panel);
    const badge = $(ui.badge);
    const fill = $(ui.fill);
    const meta = $(ui.meta);
    const btn = $(ui.btn);
    if (!panel || !badge || !fill || !meta) return;

    panel.classList.remove("hidden");

    const pct =
      job.total > 0
        ? Math.min(100, Math.round((job.current / job.total) * 100))
        : job.status === "running"
          ? null
          : job.status === "done"
            ? 100
            : 0;

    if (pct === null) {
      fill.classList.add("indeterminate");
      fill.style.width = "";
    } else {
      fill.classList.remove("indeterminate");
      fill.style.width = pct + "%";
    }

    if (job.status === "running") {
      badge.className = "job-badge running";
      badge.textContent = type === "build" ? "Đang gia công..." : "Đang lọc session...";
      if (btn) btn.disabled = true;
    } else if (job.status === "done") {
      badge.className = "job-badge done";
      badge.textContent = "✅ Hoàn thành";
      if (btn) btn.disabled = false;
    } else if (job.status === "error") {
      badge.className = "job-badge error";
      badge.textContent = "❌ Lỗi";
      if (btn) btn.disabled = false;
    } else {
      badge.className = "job-badge";
      badge.textContent = "Chờ xử lý";
    }

    let metaText = job.phase || "—";
    if (job.total > 0) {
      metaText += ` · ${job.current}/${job.total}`;
      if (pct !== null) metaText += ` (${pct}%)`;
    }
    if (type === "filter" && (job.alive != null || job.dead != null)) {
      metaText += `<br>🟢 Sống: ${job.alive ?? 0} · 💀 Chết: ${job.dead ?? 0}`;
    }
    if (job.detail) {
      metaText += `<br><span class="muted">${esc(job.detail)}</span>`;
    }
    if (job.error) {
      metaText += `<br><span class="error">${esc(job.error)}</span>`;
    }
    meta.innerHTML = metaText;
  }

  function hideJobUi(type) {
    const ui = jobUi[type];
    $(ui.panel)?.classList.add("hidden");
    const btn = $(ui.btn);
    if (btn) btn.disabled = false;
  }

  function formatBuildResult(result) {
    return `✅ Gia công xong <strong>${result.count}</strong> session → <code>${esc(result.manifestPath)}</code>`;
  }

  function formatFilterResult(result) {
    let msg = `✅ Lọc xong · 🟢 Sống: <strong>${result.alive}</strong> · 💀 Chết: <strong>${result.dead}</strong>`;
    if (result.deadList?.length) {
      const shown = result.deadList.slice(0, 8);
      msg +=
        "<br>" +
        shown.map((d) => `${esc(d.id)}: ${esc(d.reason)}`).join("<br>");
      if (result.deadList.length > 8) {
        msg += `<br><span class="muted">... và ${result.deadList.length - 8} session chết khác</span>`;
      }
    }
    return msg;
  }

  async function pollJob(jobId, type, logEl) {
    while (true) {
      const job = await sessionApi("/jobs/" + jobId);
      renderJobUi(type, job);

      if (job.status === "done") {
        if (type === "build") {
          setLog(logEl, formatBuildResult(job.result));
        } else {
          setLog(logEl, formatFilterResult(job.result));
        }
        await refreshSessionStats();
        return job;
      }

      if (job.status === "error") {
        setLog(logEl, esc(job.error || "Lỗi không xác định"), true);
        throw new Error(job.error || "Job failed");
      }

      await sleep(POLL_MS);
    }
  }

  async function startJob(type, path, body, logEl) {
    const ui = jobUi[type];
    setLog(logEl, type === "build" ? "Khởi động gia công..." : "Khởi động lọc session...");
    renderJobUi(type, {
      status: "running",
      phase: "Khởi động",
      current: 0,
      total: 0,
    });

    const { jobId } = await sessionApi(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });

    return pollJob(jobId, type, logEl);
  }

  async function resumeActiveJobs() {
    for (const type of ["build", "filter"]) {
      const { job } = await sessionApi("/jobs/active?type=" + type);
      if (!job) continue;
      const logEl = type === "build" ? $("#buildLog") : $("#filterLog");
      if (job.status === "done") {
        renderJobUi(type, job);
        if (type === "build") setLog(logEl, formatBuildResult(job.result));
        else setLog(logEl, formatFilterResult(job.result));
      } else if (job.status === "error") {
        renderJobUi(type, job);
        setLog(logEl, esc(job.error), true);
      } else {
        pollJob(job.id, type, logEl).catch(() => {});
      }
    }
  }

  function renderSessionLists(stats) {
    const maxShow = 50;
    $("#pendingCount").textContent = stats.pendingFiles.length;
    $("#aliveCount").textContent = stats.manifest.total;
    $("#deadCount").textContent = stats.dead.total;

    const pending = stats.pendingFiles;
    $("#pendingList").innerHTML =
      pending.length === 0
        ? '<li class="muted">Không có file mới</li>'
        : pending
            .slice(0, maxShow)
            .map((f) => `<li><code>${esc(f)}</code></li>`)
            .join("") +
          (pending.length > maxShow
            ? `<li class="muted">... +${pending.length - maxShow} file</li>`
            : "");

    const alive = stats.manifest.sessions;
    $("#aliveList").innerHTML =
      alive.length === 0
        ? '<li class="muted">Chưa gia công</li>'
        : alive
            .slice(0, maxShow)
            .map(
              (s) =>
                `<li><strong>${esc(s.id)}</strong> <span class="muted">${esc(s.firstName || s.username || s.convertedFrom || "")}</span></li>`
            )
            .join("") +
          (alive.length > maxShow
            ? `<li class="muted">... +${alive.length - maxShow} session</li>`
            : "");

    const dead = stats.dead.sessions;
    $("#deadList").innerHTML =
      dead.length === 0
        ? '<li class="muted">Chưa có</li>'
        : dead
            .slice(0, maxShow)
            .map(
              (s) =>
                `<li><strong>${esc(s.id)}</strong> <span class="muted">${esc(s.reason)}</span></li>`
            )
            .join("") +
          (dead.length > maxShow
            ? `<li class="muted">... +${dead.length - maxShow} session</li>`
            : "");
  }

  async function refreshSessionStats() {
    const stats = await sessionApi("/stats");
    $("#sessionStats").innerHTML = `
      <strong>Thư mục:</strong> <code>${esc(stats.sessionsDir)}</code><br>
      <strong>Manifest:</strong> ${stats.manifest.exists ? esc(stats.manifest.generatedAt?.slice(0, 19) ?? "—") : "chưa có"} — ${stats.manifest.total} session<br>
      <strong>Chờ gia công:</strong> ${stats.pendingFiles.length} file · <strong>Chết:</strong> ${stats.dead.total}
    `;
    renderSessionLists(stats);
    return stats;
  }

  async function fileToBase64(file) {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  window.refreshSessionAdmin = async function () {
    await refreshSessionStats();
    await resumeActiveJobs();
  };

  $("#btnImportSessions")?.addEventListener("click", async () => {
    const input = $("#sessionFileInput");
    const log = $("#importLog");
    const files = [...(input?.files ?? [])];
    if (files.length === 0) {
      setLog(log, "Chọn ít nhất 1 file .session hoặc .tho", true);
      return;
    }

    setLog(log, `Đang upload ${files.length} file...`);
    const btn = $("#btnImportSessions");
    if (btn) btn.disabled = true;

    try {
      const payload = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          content: await fileToBase64(f),
        }))
      );

      const result = await sessionApi("/import", {
        method: "POST",
        body: JSON.stringify({ files: payload }),
      });

      let msg = `✅ Đã lưu ${result.saved.length} file`;
      if (result.errors?.length) {
        msg += `<br>⚠️ Lỗi (${result.errors.length}):<br>${result.errors.map(esc).join("<br>")}`;
      }
      setLog(log, msg, result.errors?.length > 0 && result.saved.length === 0);
      if (input) input.value = "";
      await refreshSessionStats();
    } catch (err) {
      setLog(log, esc(err.message), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("#btnLoginSession")?.addEventListener("click", async () => {
    const log = $("#loginLog");
    const input = $("#loginCloneId");
    const cloneId = (input?.value ?? "").trim() || window.prompt("Nhập Clone ID để đăng nhập:", "")?.trim();

    if (!cloneId) {
      setLog(log, "Nhập Clone ID trước khi login", true);
      return;
    }

    if (input) input.value = cloneId;
    const btn = $("#btnLoginSession");
    if (btn) btn.disabled = true;
    setLog(log, `Đang khởi động login cho <strong>${esc(cloneId)}</strong>...`);

    try {
      const result = await sessionApi("/login", {
        method: "POST",
        body: JSON.stringify({ cloneId }),
      });
      setLog(
        log,
        `✅ Đã khởi động login cho <strong>${esc(result.cloneId)}</strong>.<br>Vui lòng theo dõi terminal để nhập số điện thoại / OTP.`
      );
    } catch (err) {
      setLog(log, esc(err.message), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("#btnBuildSessions")?.addEventListener("click", async () => {
    const log = $("#buildLog");
    try {
      await startJob("build", "/build", null, log);
    } catch (err) {
      setLog(log, esc(err.message), true);
    }
  });

  $("#btnSyncManifest")?.addEventListener("click", async () => {
    const log = $("#buildLog");
    const btn = $("#btnSyncManifest");
    if (btn) btn.disabled = true;
    setLog(log, "Đang sync...");
    try {
      const result = await sessionApi("/sync", { method: "POST" });
      setLog(log, `✅ Sync ${result.clones} clones, ${result.groups} groups → seeding.config.json`);
    } catch (err) {
      setLog(log, esc(err.message), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("#btnFilterSessions")?.addEventListener("click", async () => {
    const log = $("#filterLog");
    const concurrency = parseInt($("#filterConcurrency")?.value ?? "3", 10) || 3;
    try {
      await startJob("filter", "/filter", { concurrency }, log);
    } catch (err) {
      setLog(log, esc(err.message), true);
    }
  });

  $("#btnRefreshSessions")?.addEventListener("click", () => {
    refreshSessionStats().catch((err) => alert(err.message));
  });

  resumeActiveJobs().catch(() => {});
})();
