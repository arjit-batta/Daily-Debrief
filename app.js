(function () {
  "use strict";

  const STORAGE_KEYS = {
    entries: "daily-debrief-entries",
    apiKey: "daily-debrief-api-key",
  };

  const CLAUDE_MODEL = "claude-opus-4-5";
  const ANTHROPIC_VERSION = "2023-06-01";
  const HISTORY_DAYS = 7;

  const $ = (id) => document.getElementById(id);

  const els = {
    todayDate: $("today-date"),
    form: $("check-in-form"),
    planned: $("planned"),
    actual: $("actual"),
    blockers: $("blockers"),
    submitBtn: $("submit-btn"),
    responseSection: $("response-section"),
    responseLoading: $("response-loading"),
    responseContent: $("response-content"),
    responseError: $("response-error"),
    historyEmpty: $("history-empty"),
    historyList: $("history-list"),
    settingsBtn: $("settings-btn"),
    settingsModal: $("settings-modal"),
    modalBackdrop: $("modal-backdrop"),
    modalCancel: $("modal-cancel"),
    modalSave: $("modal-save"),
    apiKeyInput: $("api-key-input"),
  };

  let pendingSubmit = false;

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseISODate(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  /** e.g. "Monday, 18 May 2026" — used in UI and API prompts */
  function formatFullDate(isoDate) {
    return parseISODate(isoDate).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function getTodayContext() {
    const iso = todayISO();
    return { iso, full: formatFullDate(iso) };
  }

  function formatShortDate(isoDate) {
    return parseISODate(isoDate).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function daysAgoISO(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  }

  function setApiKey(key) {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEYS.apiKey, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
    }
  }

  function getEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.entries);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
  }

  function sortEntries(entries) {
    return [...entries].sort((a, b) => b.date.localeCompare(a.date));
  }

  function getRecentEntries(excludeDate) {
    const cutoff = daysAgoISO(HISTORY_DAYS);
    return sortEntries(getEntries()).filter(
      (e) => e.date >= cutoff && e.date !== excludeDate
    );
  }

  function getYesterdayEntry() {
    const yesterday = daysAgoISO(1);
    return getEntries().find((e) => e.date === yesterday) || null;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function textToHtml(text) {
    return escapeHtml(text)
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function setTodayLabel() {
    els.todayDate.textContent = getTodayContext().full;
  }

  function showResponseSection() {
    els.responseSection.hidden = false;
  }

  function setResponseLoading(loading) {
    els.responseLoading.hidden = !loading;
    els.responseContent.hidden = loading;
    els.responseError.hidden = true;
    if (loading) {
      els.responseContent.innerHTML = "";
    }
  }

  function showResponse(text) {
    setResponseLoading(false);
    els.responseContent.innerHTML = textToHtml(text);
    els.responseContent.hidden = false;
  }

  function showResponseError(message) {
    setResponseLoading(false);
    els.responseContent.hidden = true;
    els.responseError.hidden = false;
    els.responseError.textContent = message;
  }

  function openSettingsModal() {
    els.apiKeyInput.value = getApiKey();
    els.settingsModal.hidden = false;
    els.apiKeyInput.focus();
  }

  function closeSettingsModal() {
    els.settingsModal.hidden = true;
    els.apiKeyInput.value = "";
    pendingSubmit = false;
  }

  function requireApiKey() {
    if (getApiKey()) return true;
    pendingSubmit = true;
    openSettingsModal();
    return false;
  }

  function buildPrompt(planned, actual, blockers, recentEntries, yesterday, today) {
    let historyBlock = "";

    if (recentEntries.length > 0) {
      historyBlock = recentEntries
        .map((e) => {
          return `### ${formatFullDate(e.date)} (${e.date})
Planned: ${e.planned || "(none)"}
Actual: ${e.actual || "(none)"}
Blockers: ${e.blockers || "(none)"}
Reflection given: ${e.aiResponse || "(none)"}`;
        })
        .join("\n\n");
    } else {
      historyBlock = "(No prior entries in the last 7 days.)";
    }

    let yesterdayNote = "";
    if (yesterday) {
      yesterdayNote = `\n\nYESTERDAY — ${formatFullDate(yesterday.date)} (${yesterday.date}) specifically:
Planned: ${yesterday.planned}
Actual: ${yesterday.actual}
Blockers: ${yesterday.blockers || "(none)"}`;
    } else {
      const yesterdayIso = daysAgoISO(1);
      yesterdayNote = `\n\nThere is no entry from yesterday (${formatFullDate(yesterdayIso)}, ${yesterdayIso}).`;
    }

    return `You are a thoughtful accountability partner for someone's evening debrief. Be warm, direct, and concise — 2–4 short paragraphs max. No bullet lists unless truly necessary. No corporate cheerleading.

Reference what they wrote yesterday when relevant (continuity, patterns, gentle accountability). Notice patterns across the last week if you see them (recurring blockers, plan vs. reality gaps, wins).

TODAY'S CHECK-IN — ${today.full} (${today.iso}):
Planned: ${planned}
Actual: ${actual}
Blockers: ${blockers || "(none)"}
${yesterdayNote}

PRIOR ENTRIES (last ${HISTORY_DAYS} days, newest first):
${historyBlock}

Write your reflection now. Speak to them as "you." When mentioning today, use "${today.full}" — do not infer the day of the week yourself.`;
  }

  async function parseResponseBody(res) {
    const text = await res.text();
    if (!text) return { data: {}, raw: "" };
    try {
      return { data: JSON.parse(text), raw: text };
    } catch {
      return { data: { parseError: true }, raw: text };
    }
  }

  function formatApiError(data, status, raw) {
    const lines = [`HTTP ${status}`];

    if (data?.error && typeof data.error === "object") {
      const err = data.error;
      if (err.type) lines.push(`Type: ${err.type}`);
      if (err.message) lines.push(err.message);
    }

    if (typeof data?.message === "string" && !lines.some((l) => l === data.message)) {
      lines.push(data.message);
    }

    if (lines.length === 1 && raw) {
      lines.push(raw.length > 600 ? `${raw.slice(0, 600)}…` : raw);
    } else if (lines.length === 1) {
      lines.push("Unknown API error. Check your API key and try again.");
    }

    return lines.join("\n");
  }

  async function fetchClaudeReflection(planned, actual, blockers) {
    const apiKey = getApiKey();
    const today = getTodayContext();
    const recent = getRecentEntries(today.iso);
    const yesterday = getYesterdayEntry();
    const userPrompt = buildPrompt(planned, actual, blockers, recent, yesterday, today);

    const systemPrompt = `You help someone reflect on their day with honesty and compassion. You remember their recent history and speak like a trusted friend, not a coach or therapist.

Today is ${today.full} (ISO date: ${today.iso}). This is the user's correct local calendar day. Always use this day name and date when referring to "today" — never guess the day of the week from entry timestamps or ISO strings alone.`;

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 600,
          system: [{ type: "text", text: systemPrompt }],
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: userPrompt }],
            },
          ],
        }),
      });
    } catch (networkErr) {
      throw new Error(
        `Network error: ${networkErr.message}\n\nTip: serve this app from localhost (e.g. python3 -m http.server 8080), not file://.`
      );
    }

    const { data, raw } = await parseResponseBody(res);

    if (!res.ok) {
      throw new Error(formatApiError(data, res.status, raw));
    }

    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      throw new Error(
        `No text in API response.\n\nRaw response:\n${raw.slice(0, 600) || "(empty)"}`
      );
    }

    return text;
  }

  function upsertEntry(entry) {
    const entries = getEntries().filter((e) => e.date !== entry.date);
    entries.push(entry);
    saveEntries(entries);
  }

  function renderHistory() {
    const entries = sortEntries(getEntries());
    els.historyList.innerHTML = "";

    if (entries.length === 0) {
      els.historyEmpty.hidden = false;
      return;
    }

    els.historyEmpty.hidden = true;

    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "history__item";

      const preview =
        entry.actual?.slice(0, 60) ||
        entry.planned?.slice(0, 60) ||
        "Check-in";

      li.innerHTML = `
        <button type="button" class="history__summary" aria-expanded="false">
          <span class="history__date">${escapeHtml(formatShortDate(entry.date))}</span>
          <span class="history__preview">${escapeHtml(preview)}${preview.length >= 60 ? "…" : ""}</span>
          <span class="history__chevron" aria-hidden="true">▼</span>
        </button>
        <div class="history__body">
          <div class="history__block">
            <p class="history__block-label">Planned</p>
            <p class="history__block-text">${escapeHtml(entry.planned || "")}</p>
          </div>
          <div class="history__block">
            <p class="history__block-label">Actual</p>
            <p class="history__block-text">${escapeHtml(entry.actual || "")}</p>
          </div>
          <div class="history__block">
            <p class="history__block-label">Blockers</p>
            <p class="history__block-text">${escapeHtml(entry.blockers || "—")}</p>
          </div>
          ${
            entry.aiResponse
              ? `<div class="history__reflection">
            <p class="history__block-label">Reflection</p>
            <p class="history__block-text">${escapeHtml(entry.aiResponse)}</p>
          </div>`
              : ""
          }
        </div>
      `;

      const summary = li.querySelector(".history__summary");
      summary.addEventListener("click", () => {
        const open = li.classList.toggle("is-open");
        summary.setAttribute("aria-expanded", open ? "true" : "false");
      });

      els.historyList.appendChild(li);
    });
  }

  function prefillTodayIfExists() {
    const existing = getEntries().find((e) => e.date === todayISO());
    if (!existing) return;
    els.planned.value = existing.planned || "";
    els.actual.value = existing.actual || "";
    els.blockers.value = existing.blockers || "";
    if (existing.aiResponse) {
      showResponseSection();
      showResponse(existing.aiResponse);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const planned = els.planned.value.trim();
    const actual = els.actual.value.trim();
    const blockers = els.blockers.value.trim();

    if (!planned || !actual) {
      els.form.reportValidity();
      return;
    }

    if (!requireApiKey()) return;

    els.submitBtn.disabled = true;
    showResponseSection();
    setResponseLoading(true);

    try {
      const aiResponse = await fetchClaudeReflection(planned, actual, blockers);

      const entry = {
        id: `${todayISO()}-${Date.now()}`,
        date: todayISO(),
        planned,
        actual,
        blockers,
        aiResponse,
        createdAt: new Date().toISOString(),
      };

      upsertEntry(entry);
      showResponse(aiResponse);
      renderHistory();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      showResponseError(message || "Something went wrong. Please try again.");
    } finally {
      els.submitBtn.disabled = false;
    }
  }

  function handleModalSave() {
    const key = els.apiKeyInput.value.trim();
    if (!key) {
      els.apiKeyInput.focus();
      return;
    }
    setApiKey(key);
    closeSettingsModal();

    if (pendingSubmit) {
      pendingSubmit = false;
      els.form.requestSubmit();
    }
  }

  function init() {
    setTodayLabel();
    renderHistory();
    prefillTodayIfExists();

    els.form.addEventListener("submit", handleSubmit);
    els.settingsBtn.addEventListener("click", openSettingsModal);
    els.modalCancel.addEventListener("click", closeSettingsModal);
    els.modalBackdrop.addEventListener("click", closeSettingsModal);
    els.modalSave.addEventListener("click", handleModalSave);

    els.apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleModalSave();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.settingsModal.hidden) {
        closeSettingsModal();
      }
    });
  }

  init();
})();
