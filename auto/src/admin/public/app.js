const API = "/api";

let clones = [];
let groups = [];
let scenarios = [];
let currentId = null;

const $ = (sel) => document.querySelector(sel);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

let currentFilter = "manual";

async function loadResources() {
  const query =
    currentFilter === "manual"
      ? "?source=manual"
      : `?source=bcr&eventType=${currentFilter}`;

  [clones, groups, scenarios] = await Promise.all([
    api("/clones"),
    api("/groups"),
    api("/scenarios" + (currentFilter === "all" ? "" : query)),
  ]);
}

async function refreshBcrStats() {
  try {
    const b = await api("/bcr/stats");
    $("#bcrStats").innerHTML = `
      <strong>Kịch bản BCR</strong><br>
      🟢 Khen: ${b.counts.win ?? 0}<br>
      🟡 Hòa/Hỏi: ${b.counts.draw ?? 0}<br>
      🔴 Thắc mắc: ${b.counts.lose ?? 0}<br>
      🔵 Hỏi đáp: ${b.counts.qa ?? 0}
    `;
  } catch {
    $("#bcrStats").textContent = "BCR: —";
  }
}

function scenarioBadge(s) {
  if (s.source === "bcr" && s.eventType === "win")
    return '<span class="badge badge-win">Khen</span>';
  if (s.source === "bcr" && s.eventType === "draw")
    return '<span class="badge badge-draw">Hòa/Hỏi</span>';
  if (s.source === "bcr" && s.eventType === "lose")
    return '<span class="badge badge-lose">Thắc mắc</span>';
  if (s.source === "bcr" && s.eventType === "qa")
    return '<span class="badge badge-qa">Hỏi đáp</span>';
  return '<span class="badge badge-manual">Manual</span>';
}

async function refreshStats() {
  try {
    const s = await api("/queue/stats");
    $("#queueStats").innerHTML = `
      <strong>Queue</strong><br>
      ⏳ Chờ: ${s.waiting}<br>
      ▶ Chạy: ${s.active}<br>
      ✅ Xong: ${s.completed}<br>
      ❌ Lỗi: ${s.failed}
    `;
  } catch {
    $("#queueStats").textContent = "Queue chưa kết nối";
  }
}

function renderScenarioList() {
  const el = $("#scenarioList");
  el.innerHTML = scenarios
    .map(
      (s) => `
    <div class="scenario-item ${s.id === currentId ? "active" : ""}" data-id="${s.id}">
      <div class="name">${esc(s.name)}</div>
      <div class="sub">${esc(s.groupId)} · ${s.steps.length} bước</div>
      ${scenarioBadge(s)}
    </div>`
    )
    .join("");

  el.querySelectorAll(".scenario-item").forEach((item) => {
    item.onclick = () => openScenario(item.dataset.id);
  });
}

function fillGroupSelect(selected) {
  const sel = $("#groupId");
  sel.innerHTML = groups
    .map(
      (g) =>
        `<option value="${esc(g.id)}" ${g.id === selected ? "selected" : ""}>${esc(g.name)} (${esc(g.id)})</option>`
    )
    .join("");
}

function cloneOptions(selected) {
  const aliveIds = new Set(clones.map((c) => c.id));
  let html = clones
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.label)} (${esc(c.id)})</option>`
    )
    .join("");

  if (selected && !aliveIds.has(selected)) {
    html =
      `<option value="" disabled selected>💀 ${esc(selected)} — session chết</option>` +
      html;
  }

  if (!html) {
    return '<option value="" disabled selected>— Chưa có session sống —</option>';
  }

  return html;
}

function renderStep(step, index) {
  const card = document.createElement("div");
  card.className = "step-card";
  card.dataset.index = index;

  const isMsg = step.action === "send_message";
  const isGif = step.action === "send_gif";
  const isReact = step.action === "react";

  card.innerHTML = `
    <div class="step-card-header">
      <span>Bước ${index + 1}</span>
      <button type="button" class="btn btn-sm btn-danger btn-remove">Xóa</button>
    </div>
    <div class="step-grid">
      <label>Account (clone)
        <select class="step-clone">${cloneOptions(step.cloneId)}</select>
      </label>
      <label>Hành động
        <select class="step-action">
          <option value="send_message" ${step.action === "send_message" ? "selected" : ""}>Gửi tin nhắn</option>
          <option value="send_gif" ${step.action === "send_gif" ? "selected" : ""}>Gửi GIF</option>
          <option value="react" ${step.action === "react" ? "selected" : ""}>Thả reaction</option>
          <option value="join" ${step.action === "join" ? "selected" : ""}>Join group</option>
        </select>
      </label>
      <label class="field-text ${isMsg ? "" : "hidden"}">Nội dung tin
        <textarea class="step-text" rows="2">${esc(step.text || "")}</textarea>
      </label>
      <label class="field-gif ${isGif ? "" : "hidden"}">URL GIF / MP4
        <input type="url" class="step-gif-url" placeholder="https://...gif hoặc .mp4" value="${esc(step.gifUrl || "")}" />
      </label>
      <label class="field-gif-caption ${isGif ? "" : "hidden"}">Caption (tuỳ chọn)
        <input type="text" class="step-gif-caption" placeholder="Chú thích kèm GIF" value="${esc(isGif ? (step.text || "") : "")}" />
      </label>
      <label class="field-reaction ${isReact ? "" : "hidden"}">Reaction
        <input class="step-reaction" value="${esc(step.reaction || "👍")}" />
      </label>
      <label>Delay trước bước (giây)
        <input type="number" class="step-delay" min="0" value="${step.delayBeforeSec ?? 10}" />
      </label>
      <label>Chạy lúc
        <input type="datetime-local" class="step-runat" value="${toLocalInput(step.runAt)}" />
      </label>
    </div>
  `;

  card.querySelector(".btn-remove").onclick = () => {
    card.remove();
    renumberSteps();
  };

  card.querySelector(".step-action").onchange = (e) => {
    const v = e.target.value;
    card.querySelector(".field-text").classList.toggle("hidden", v !== "send_message");
    card.querySelector(".field-gif").classList.toggle("hidden", v !== "send_gif");
    card.querySelector(".field-gif-caption").classList.toggle("hidden", v !== "send_gif");
    card.querySelector(".field-reaction").classList.toggle("hidden", v !== "react");
  };

  return card;
}

function renumberSteps() {
  document.querySelectorAll(".step-card").forEach((card, i) => {
    card.querySelector(".step-card-header span").textContent = `Bước ${i + 1}`;
    card.dataset.index = i;
  });
}

function renderSteps(steps = []) {
  const container = $("#stepsContainer");
  container.innerHTML = "";
  const defaultSteps =
    steps.length > 0
      ? steps
      : [
          {
            cloneId: clones[0]?.id ?? "",
            action: "send_message",
            text: "",
            delayBeforeSec: 10,
            runAt: new Date().toISOString(),
          },
        ];
  defaultSteps.forEach((s, i) => container.appendChild(renderStep(s, i)));
}

function collectSteps() {
  return [...document.querySelectorAll(".step-card")].map((card) => {
    const action = card.querySelector(".step-action").value;
    const runAtVal = card.querySelector(".step-runat").value;
    return {
      cloneId: card.querySelector(".step-clone").value,
      action,
      text:
        action === "send_message"
          ? card.querySelector(".step-text").value
          : action === "send_gif"
            ? card.querySelector(".step-gif-caption").value || undefined
            : undefined,
      gifUrl: action === "send_gif" ? card.querySelector(".step-gif-url").value : undefined,
      reaction: action === "react" ? card.querySelector(".step-reaction").value : undefined,
      delayBeforeSec: parseInt(card.querySelector(".step-delay").value, 10) || 0,
      runAt: runAtVal ? new Date(runAtVal).toISOString() : undefined,
    };
  });
}

function openScenario(id) {
  currentId = id;
  const s = scenarios.find((x) => x.id === id);
  if (!s) return;

  $("#emptyState").classList.add("hidden");
  $("#scenarioForm").classList.remove("hidden");
  $("#scenarioName").value = s.name;
  fillGroupSelect(s.groupId);
  $("#scheduledAt").value = toLocalInput(s.scheduledAt);
  renderSteps(s.steps);
  renderScenarioList();
  $("#runStatus").classList.add("hidden");
}

function newScenario() {
  currentId = null;
  $("#emptyState").classList.add("hidden");
  $("#scenarioForm").classList.remove("hidden");
  const filterLabels = {
    win: "Khen",
    draw: "Hòa/Hỏi",
    lose: "Thắc mắc",
    qa: "Hỏi đáp",
  };
  $("#scenarioName").value =
    currentFilter === "manual"
      ? "Kịch bản mới"
      : `BCR ${filterLabels[currentFilter] ?? currentFilter} mới`;
  fillGroupSelect(groups.find((g) => g.enabled)?.id ?? groups[0]?.id);
  $("#scheduledAt").value = nowLocalInput();
  renderSteps([]);
  renderScenarioList();
}

async function saveScenario(e) {
  e.preventDefault();
  const body = {
    name: $("#scenarioName").value.trim(),
    groupId: $("#groupId").value,
    source: currentFilter === "manual" ? "manual" : "bcr",
    eventType: currentFilter === "manual" ? undefined : currentFilter,
    scheduledAt: $("#scheduledAt").value
      ? new Date($("#scheduledAt").value).toISOString()
      : undefined,
    steps: collectSteps(),
  };

  if (currentId) {
    await api(`/scenarios/${currentId}`, { method: "PUT", body: JSON.stringify(body) });
  } else {
    const created = await api("/scenarios", { method: "POST", body: JSON.stringify(body) });
    currentId = created.id;
  }

  await loadResources();
  renderScenarioList();
  showStatus("✅ Đã lưu kịch bản");
}

async function runScenario() {
  if (!currentId) {
    showStatus("⚠️ Lưu kịch bản trước khi chạy", true);
    return;
  }
  try {
    const result = await api(`/scenarios/${currentId}/run`, { method: "POST" });
    showStatus(`▶ ${result.message}<br>Workflow: <code>${result.workflowId}</code>`);
    pollWorkflow(result.workflowId);
  } catch (err) {
    showStatus(`❌ ${err.message}`, true);
  }
}

async function pollWorkflow(id) {
  const el = $("#runStatus");
  const timer = setInterval(async () => {
    try {
      const state = await api(`/workflows/${id}`);
      el.innerHTML = `📊 ${state.status} — ${state.completedSteps}/${state.totalSteps} bước`;
      if (state.status === "completed" || state.status === "failed") {
        clearInterval(timer);
        el.innerHTML += state.errors?.length
          ? `<br>❌ ${state.errors.join(", ")}`
          : "<br>✅ Hoàn thành!";
        refreshStats();
      }
    } catch {
      clearInterval(timer);
    }
  }, 3000);
}

async function deleteScenario() {
  if (!currentId || !confirm("Xóa kịch bản này?")) return;
  await api(`/scenarios/${currentId}`, { method: "DELETE" });
  currentId = null;
  $("#scenarioForm").classList.add("hidden");
  $("#emptyState").classList.remove("hidden");
  await loadResources();
  renderScenarioList();
}

function showStatus(msg, isError = false) {
  const el = $("#runStatus");
  el.classList.remove("hidden");
  el.innerHTML = msg;
  el.style.borderLeft = `3px solid ${isError ? "var(--danger)" : "var(--success)"}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function nowLocalInput(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalInput(iso) {
  if (!iso) return nowLocalInput();
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Thời gian mặc định cho bước mới = bước trước + delay (hoặc hiện tại) */
function getNextStepRunAt() {
  const cards = [...document.querySelectorAll(".step-card")];
  if (cards.length === 0) return nowLocalInput();

  const last = cards[cards.length - 1];
  const lastRunAt = last.querySelector(".step-runat").value;
  const lastDelay = parseInt(last.querySelector(".step-delay").value, 10) || 0;
  const base = lastRunAt ? new Date(lastRunAt) : new Date();
  base.setSeconds(base.getSeconds() + lastDelay);
  return nowLocalInput(base);
}

function switchAdminView(view) {
  const isSessions = view === "sessions";
  document.querySelectorAll("#viewTabs .view-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });
  $("#sidebarScenarios")?.classList.toggle("hidden", isSessions);
  $("#scenariosView")?.classList.toggle("hidden", isSessions);
  $("#sessionsView")?.classList.toggle("hidden", !isSessions);
  if (isSessions && typeof window.refreshSessionAdmin === "function") {
    window.refreshSessionAdmin().catch((err) => {
      const log = document.querySelector("#importLog");
      if (log) {
        log.textContent = err.message;
        log.className = "action-log error";
      }
    });
  }
}

$("#viewTabs")?.addEventListener("click", (e) => {
  const tab = e.target.closest(".view-tab");
  if (tab?.dataset.view) switchAdminView(tab.dataset.view);
});

$("#btnNew").onclick = newScenario;
$("#btnAddStep").onclick = () => {
  const container = $("#stepsContainer");
  container.appendChild(
    renderStep(
      {
        cloneId: clones[0]?.id ?? "",
        action: "send_message",
        delayBeforeSec: 15,
        runAt: new Date(getNextStepRunAt()).toISOString(),
      },
      container.children.length
    )
  );
};
$("#scenarioForm").onsubmit = saveScenario;
$("#btnRun").onclick = runScenario;
$("#btnDelete").onclick = deleteScenario;

document.querySelectorAll("#filterTabs .tab").forEach((tab) => {
  tab.onclick = async () => {
    document.querySelectorAll("#filterTabs .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    currentId = null;
    $("#scenarioForm").classList.add("hidden");
    $("#emptyState").classList.remove("hidden");
    await loadResources();
    renderScenarioList();
  };
});

(async function init() {
  try {
    await loadResources();
    renderScenarioList();
    fillGroupSelect();
    await refreshStats();
    await refreshBcrStats();
    setInterval(refreshStats, 10000);
    setInterval(refreshBcrStats, 30000);
  } catch (err) {
    alert("Lỗi kết nối API: " + err.message + "\nChạy: npm run admin");
  }
})();
