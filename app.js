(function () {
  "use strict";

  if (!window.SalaryCore) {
    console.error("SalaryCore 未加载，请确认 salary.js 与 index.html 在同一目录。");
    return;
  }

  const {
    buildSalaryConfig,
    formatDuration,
    formatHours,
    formatHourValue,
    formatMoney,
    formatPercent,
    getBeijingClock,
    getEarningsSnapshot,
    parseTimeToMinutes,
  } = window.SalaryCore;

  const STORAGE_KEY = "salary-clock:settings:v1";
  const DEFAULTS = Object.freeze({
    monthlySalary: "12000",
    workDays: "21.75",
    startTime: "09:00",
    endTime: "18:00",
  });

  const elements = {
    form: document.querySelector("#salaryForm"),
    salary: document.querySelector("#monthlySalary"),
    workDays: document.querySelector("#workDays"),
    startTime: document.querySelector("#startTime"),
    endTime: document.querySelector("#endTime"),
    reset: document.querySelector("#resetButton"),
    calculateButton: document.querySelector("#calculateButton"),
    calculateLabel: document.querySelector("#calculateLabel"),
    applyNote: document.querySelector("#applyNote"),
    formMessage: document.querySelector("#formMessage"),
    durationHint: document.querySelector("#durationHint"),
    monthlyHours: document.querySelector("#monthlyHours"),
    dailyAverage: document.querySelector("#dailyAverage"),
    today: document.querySelector("#todayHeading"),
    clock: document.querySelector("#clock"),
    clockMain: document.querySelector("#clockMain"),
    clockSeconds: document.querySelector("#clockSeconds"),
    orbit: document.querySelector("#orbit"),
    statusText: document.querySelector("#statusText"),
    earned: document.querySelector("#earned"),
    rate: document.querySelector("#rate"),
    dailyCap: document.querySelector("#dailyCap"),
    duration: document.querySelector("#duration"),
    progressTrack: document.querySelector("#progressTrack"),
    progressFill: document.querySelector("#progressFill"),
    progressHead: document.querySelector("#progressHead"),
    progressPercent: document.querySelector("#progressPercent"),
    progressNote: document.querySelector("#progressNote"),
    startLabel: document.querySelector("#startLabel"),
    endLabel: document.querySelector("#endLabel"),
    footerYear: document.querySelector("#footerYear"),
  };

  const state = {
    config: buildSalaryConfig({
      monthlySalary: DEFAULTS.monthlySalary,
      workDaysPerMonth: DEFAULTS.workDays,
      startTime: DEFAULTS.startTime,
      endTime: DEFAULTS.endTime,
    }),
    appliedSettings: null,
    isDirty: false,
    lastMinuteKey: null,
    displayedEarned: null,
    moneyFrame: null,
    timer: null,
  };

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  /* Storage ----------------------------------------------------------------- */

  function readStoredSettings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };

      const asValue = (value, fallback) =>
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : fallback;

      return {
        monthlySalary: asValue(parsed.monthlySalary, DEFAULTS.monthlySalary),
        workDays: asValue(parsed.workDays, DEFAULTS.workDays),
        startTime: /^\d{2}:\d{2}$/.test(parsed.startTime)
          ? parsed.startTime
          : DEFAULTS.startTime,
        endTime: /^\d{2}:\d{2}$/.test(parsed.endTime)
          ? parsed.endTime
          : DEFAULTS.endTime,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing or a restrictive file:// context can reject storage.
    }
  }

  function readFormSettings() {
    return {
      monthlySalary: elements.salary.value,
      workDays: elements.workDays.value,
      startTime: elements.startTime.value,
      endTime: elements.endTime.value,
    };
  }

  function settingsEqual(a, b) {
    if (!a || !b) return false;
    return (
      a.monthlySalary === b.monthlySalary &&
      a.workDays === b.workDays &&
      a.startTime === b.startTime &&
      a.endTime === b.endTime
    );
  }

  /* Rendering ---------------------------------------------------------------- */

  function showValidation(config) {
    const salaryInvalid =
      !Number.isFinite(config.salary) ||
      config.salary <= 0 ||
      config.salary > 1_000_000_000;
    const daysInvalid =
      !Number.isFinite(config.workDays) ||
      config.workDays <= 0 ||
      config.workDays > 31;
    const timeInvalid =
      !Number.isFinite(config.startMinutes) ||
      !Number.isFinite(config.endMinutes) ||
      config.endMinutes <= config.startMinutes;

    elements.salary.setAttribute("aria-invalid", String(salaryInvalid));
    elements.workDays.setAttribute("aria-invalid", String(daysInvalid));
    elements.startTime.setAttribute("aria-invalid", String(timeInvalid));
    elements.endTime.setAttribute("aria-invalid", String(timeInvalid));
    elements.formMessage.textContent = config.errors[0] ?? "";
  }

  function clearValidation() {
    elements.salary.setAttribute("aria-invalid", "false");
    elements.workDays.setAttribute("aria-invalid", "false");
    elements.startTime.setAttribute("aria-invalid", "false");
    elements.endTime.setAttribute("aria-invalid", "false");
    elements.formMessage.textContent = "";
  }

  function renderDraftHint() {
    const start = parseTimeToMinutes(elements.startTime.value);
    const end = parseTimeToMinutes(elements.endTime.value);

    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const minutes = end - start;
      elements.durationHint.textContent = `共 ${formatHours(
        minutes,
      )} 小时 · ${minutes} 分钟`;
    } else if (Number.isFinite(start) && Number.isFinite(end)) {
      elements.durationHint.textContent = "下班时间需晚于上班时间";
    } else {
      elements.durationHint.textContent = "等待完整的上下班时间";
    }
  }

  function setDirty(dirty) {
    state.isDirty = dirty;
    elements.calculateButton.classList.toggle("is-dirty", dirty);
    elements.applyNote.classList.toggle("is-dirty", dirty);

    const label = dirty ? "应用新设定" : "更新计算";
    const note = dirty
      ? "有未应用的修改，点击按钮更新数据"
      : "当前数据已按左侧设定计算";

    if (elements.calculateLabel.textContent !== label) {
      elements.calculateLabel.textContent = label;
    }
    if (elements.applyNote.textContent !== note) {
      elements.applyNote.textContent = note;
    }
  }

  function setProgress(progress) {
    const percent = Math.min(1, Math.max(0, progress));
    elements.progressFill.style.width = `${percent * 100}%`;
    elements.progressHead.style.left = `${percent * 100}%`;
    elements.progressPercent.textContent = formatPercent(percent);
    elements.progressTrack.setAttribute(
      "aria-valuenow",
      String(Math.round(percent * 100)),
    );
  }

  function renderInvalid() {
    document.body.dataset.phase = "invalid";
    elements.statusText.textContent = "等待输入";
    elements.rate.textContent = "—";
    elements.dailyCap.textContent = "—";
    elements.duration.textContent = "—";
    elements.earned.textContent = "—";
    elements.progressNote.textContent = "完善设定后显示";
    setProgress(0);
    elements.progressTrack.setAttribute("aria-valuetext", "尚无有效设定");
    stopMoneyAnimation();
    state.displayedEarned = null;
  }

  function stopMoneyAnimation() {
    if (state.moneyFrame !== null) {
      window.cancelAnimationFrame(state.moneyFrame);
      state.moneyFrame = null;
    }
  }

  function showMoney(value, animate) {
    const target = Number.isFinite(value) ? Math.max(0, value) : 0;
    const from = state.displayedEarned;
    state.displayedEarned = target;

    stopMoneyAnimation();

    if (!animate || from === null || prefersReducedMotion) {
      elements.earned.textContent = formatMoney(target);
      return;
    }

    const start = performance.now();
    const distance = target - from;
    if (Math.abs(distance) < 0.005) {
      elements.earned.textContent = formatMoney(target);
      return;
    }

    elements.earned.classList.remove("is-bumping");
    // Restart the highlight animation on each settled minute.
    void elements.earned.offsetWidth;
    elements.earned.classList.add("is-bumping");

    const duration = 680;
    const frame = (now) => {
      const ratio = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      elements.earned.textContent = formatMoney(from + distance * eased);
      if (ratio < 1) {
        state.moneyFrame = window.requestAnimationFrame(frame);
      } else {
        state.moneyFrame = null;
        elements.earned.textContent = formatMoney(target);
      }
    };

    state.moneyFrame = window.requestAnimationFrame(frame);
  }

  function renderConfig(config) {
    if (config.valid) {
      elements.durationHint.textContent = `共 ${formatHours(
        config.durationMinutes,
      )} 小时 · ${config.durationMinutes} 分钟`;
      elements.monthlyHours.textContent = formatHourValue(config.monthlyHours);
      elements.dailyAverage.textContent = formatMoney(config.dailyTotal);
      elements.startLabel.textContent = `${config.startTime} 开工`;
      elements.endLabel.textContent = `${config.endTime} 收工`;
      showValidation(config);
    } else {
      elements.durationHint.textContent = "等待完整的上下班时间";
      elements.monthlyHours.textContent = "—";
      elements.dailyAverage.textContent = "—";
      elements.startLabel.textContent = "—";
      elements.endLabel.textContent = "—";
    }
  }

  function renderEarnings({ animate = false, now = new Date() } = {}) {
    const snapshot = getEarningsSnapshot(state.config, now);

    if (snapshot.phase === "invalid") {
      renderInvalid();
      return;
    }

    const { phase } = snapshot;
    document.body.dataset.phase = phase;

    elements.rate.textContent = formatMoney(state.config.ratePerMinute);
    elements.dailyCap.textContent = formatMoney(state.config.dailyTotal);
    elements.duration.textContent = formatDuration(state.config.durationMinutes);

    if (phase === "before") {
      elements.statusText.textContent = "尚未开工";
      elements.progressNote.textContent = `距离开工 ${formatDuration(
        state.config.startMinutes - snapshot.clock.minuteOfDay,
      )}`;
    } else if (phase === "working") {
      elements.statusText.textContent = "正在赚钱";
      elements.progressNote.textContent = `已工作 ${formatDuration(
        snapshot.elapsedMinutes,
      )}`;
    } else {
      elements.statusText.textContent = "今日收工";
      elements.progressNote.textContent = `今日已完成 ${formatDuration(
        snapshot.elapsedMinutes,
      )}`;
    }

    setProgress(snapshot.progress);
    elements.progressTrack.setAttribute(
      "aria-valuetext",
      `${formatPercent(snapshot.progress)}，${elements.progressNote.textContent}`,
    );
    showMoney(snapshot.earned, animate);
  }

  function renderClock(now) {
    const clock = getBeijingClock(now);
    elements.clockMain.textContent = `${String(clock.hour).padStart(
      2,
      "0",
    )}:${String(clock.minute).padStart(2, "0")}`;
    elements.clockSeconds.textContent = `:${String(clock.second).padStart(
      2,
      "0",
    )}`;
    elements.today.textContent = clock.dateText;
    elements.clock.dateTime = `${clock.year}-${String(clock.month).padStart(
      2,
      "0",
    )}-${String(clock.day).padStart(2, "0")}T${clock.timeText}+08:00`;
    elements.clock.setAttribute(
      "aria-label",
      `${clock.dateText} ${clock.timeText} 北京时间`,
    );
    elements.orbit.style.setProperty("--seconds-angle", `${clock.second * 6}deg`);
    elements.footerYear.textContent = String(clock.year);
    return clock;
  }

  /* Apply and validate ------------------------------------------------------- */

  function focusFirstInvalid(config) {
    if (!Number.isFinite(config.salary) || config.salary <= 0) {
      elements.salary.focus();
    } else if (
      !Number.isFinite(config.workDays) ||
      config.workDays <= 0 ||
      config.workDays > 31
    ) {
      elements.workDays.focus();
    } else {
      elements.startTime.focus();
    }
  }

  function pulseCalculateError() {
    elements.calculateButton.classList.remove("is-error");
    void elements.calculateButton.offsetWidth;
    elements.calculateButton.classList.add("is-error");
  }

  function applyDraft({ initial = false, save = true } = {}) {
    const settings = readFormSettings();
    const draft = buildSalaryConfig({
      monthlySalary: settings.monthlySalary,
      workDaysPerMonth: settings.workDays,
      startTime: settings.startTime,
      endTime: settings.endTime,
    });

    renderDraftHint();

    if (!draft.valid) {
      showValidation(draft);
      state.isDirty = true;
      elements.calculateButton.classList.add("is-dirty");
      elements.applyNote.classList.add("is-dirty");
      elements.calculateLabel.textContent = "应用新设定";
      elements.applyNote.textContent = "请先修正提示中的问题";
      pulseCalculateError();
      focusFirstInvalid(draft);
      return false;
    }

    state.config = draft;
    state.appliedSettings = { ...settings };
    if (save) saveSettings(settings);

    renderConfig(draft);
    clearValidation();
    renderEarnings({ animate: false, now: new Date() });
    setDirty(false);

    if (!initial) {
      elements.calculateButton.classList.remove("is-applied");
      void elements.calculateButton.offsetWidth;
      elements.calculateButton.classList.add("is-applied");
    }

    return true;
  }

  function updateDraftState() {
    clearValidation();
    renderDraftHint();
    setDirty(!settingsEqual(readFormSettings(), state.appliedSettings));
  }

  /* Schedule ----------------------------------------------------------------- */

  function scheduleNextTick() {
    window.clearTimeout(state.timer);
    const delay = 1000 - (Date.now() % 1000) + 12;
    state.timer = window.setTimeout(tick, delay);
  }

  function tick({ initial = false } = {}) {
    const now = new Date();
    const clock = renderClock(now);
    const minuteChanged = clock.minuteKey !== state.lastMinuteKey;

    if (minuteChanged || initial) {
      state.lastMinuteKey = clock.minuteKey;
      renderEarnings({ animate: !initial, now });
    }

    scheduleNextTick();
  }

  /* Events ------------------------------------------------------------------- */

  function applySettings(settings) {
    elements.salary.value = settings.monthlySalary;
    elements.workDays.value = settings.workDays;
    elements.startTime.value = settings.startTime;
    elements.endTime.value = settings.endTime;
  }

  elements.form.addEventListener("input", updateDraftState);
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyDraft();
  });

  elements.reset.addEventListener("click", () => {
    applySettings(DEFAULTS);
    clearValidation();
    renderDraftHint();
    applyDraft({ initial: true, save: true });
    elements.salary.focus();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
    }
  });

  window.addEventListener("pageshow", () => {
    tick();
  });

  /* Boot --------------------------------------------------------------------- */

  const stored = readStoredSettings();
  applySettings(stored);

  if (
    !buildSalaryConfig({
      monthlySalary: stored.monthlySalary,
      workDaysPerMonth: stored.workDays,
      startTime: stored.startTime,
      endTime: stored.endTime,
    }).valid
  ) {
    applySettings(DEFAULTS);
  }

  renderDraftHint();
  applyDraft({ initial: true, save: false });
  tick({ initial: true });

  window.__salaryClockReady = true;
})();
