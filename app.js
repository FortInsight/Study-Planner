const STORAGE_KEY = "study-planner-dashboard-v1";

const defaultState = {
  items: [],
  sessions: [],
  timerSettings: {
    focusMinutes: 25,
    breakMinutes: 5,
    dailyTargetMinutes: 120
  }
};

let state = loadState();
let timer = {
  intervalId: null,
  mode: "focus",
  secondsLeft: state.timerSettings.focusMinutes * 60,
  running: false,
  selectedItemId: ""
};

const form = document.getElementById("plannerForm");
const itemsList = document.getElementById("itemsList");
const heroMetrics = document.getElementById("heroMetrics");
const reportCards = document.getElementById("reportCards");
const focusTrend = document.getElementById("focusTrend");
const typeBreakdown = document.getElementById("typeBreakdown");
const timerDisplay = document.getElementById("timerDisplay");
const timerStage = document.getElementById("timerStage");
const timerSettingsSummary = document.getElementById("timerSettingsSummary");
const todayProgressText = document.getElementById("todayProgressText");
const todayProgressBar = document.getElementById("todayProgressBar");
const planWindowTitle = document.getElementById("planWindowTitle");
const planWindowSubtitle = document.getElementById("planWindowSubtitle");
const timelineControls = document.getElementById("timelineControls");
const timerCourseSelect = document.getElementById("timerCourseSelect");
const repeatPresetInput = document.getElementById("repeatPreset");
const customRepeatFields = document.getElementById("customRepeatFields");
const repeatIntervalInput = document.getElementById("repeatInterval");
const repeatUnitInput = document.getElementById("repeatUnit");
const plannerInsight = document.getElementById("plannerInsight");

let activeView = "today";

document.getElementById("startTimer").addEventListener("click", startTimer);
document.getElementById("pauseTimer").addEventListener("click", pauseTimer);
document.getElementById("resetTimer").addEventListener("click", resetTimer);
document.getElementById("skipTimer").addEventListener("click", skipStage);
form.addEventListener("submit", handleAddItem);
form.addEventListener("input", renderPlannerInsight);
timelineControls.addEventListener("click", handleTimelineChange);
repeatPresetInput.addEventListener("change", syncRepeatControls);
timerCourseSelect.addEventListener("change", handleTimerCourseChange);

syncRepeatControls();
renderPlannerInsight();
render();

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      items: (stored?.items ?? defaultState.items).map((item) => ({
        ...item,
        pomodoro: normalizePomodoroSettings(item.pomodoro)
      })),
      sessions: stored?.sessions ?? defaultState.sessions,
      timerSettings: {
        ...defaultState.timerSettings,
        ...(stored?.timerSettings ?? {})
      }
    };
  } catch (error) {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncRepeatControls() {
  const isCustom = repeatPresetInput.value === "custom";
  customRepeatFields.hidden = !isCustom;
  repeatIntervalInput.disabled = !isCustom;
  repeatUnitInput.disabled = !isCustom;
}

function renderPlannerInsight() {
  const data = new FormData(form);
  const estimate = buildBookEstimate({
    plannedHours: Number(data.get("plannedHours")) || 0,
    bookPages: Number(data.get("bookPages")) || 0,
    dueDate: data.get("dueDate")
  });

  plannerInsight.classList.remove("active");

  if (!estimate) {
    plannerInsight.innerHTML = "<strong>Book study estimate</strong><p>Add book pages, planned hours, and a due date to see a simple daily estimate.</p>";
    return;
  }

  plannerInsight.classList.add("active");
  plannerInsight.innerHTML = `
    <strong>Book study estimate</strong>
    <p>${escapeHtml(estimate.summary)}</p>
  `;
}

function handleAddItem(event) {
  event.preventDefault();
  const data = new FormData(form);
  const item = {
    id: makeId(),
    course: data.get("course").trim(),
    title: data.get("title").trim(),
    type: data.get("type"),
    plannedHours: Number(data.get("plannedHours")) || 0,
    plannedPages: Number(data.get("plannedPages")) || 0,
    bookPages: Number(data.get("bookPages")) || 0,
    dueDate: data.get("dueDate"),
    repeat: buildRepeatConfig(data),
    pomodoro: normalizePomodoroSettings({
      focusMinutes: Number(data.get("itemFocusMinutes")),
      breakMinutes: Number(data.get("itemBreakMinutes")),
      dailyTargetMinutes: Number(data.get("itemDailyTargetMinutes"))
    }),
    bookEstimate: buildBookEstimate({
      plannedHours: Number(data.get("plannedHours")) || 0,
      bookPages: Number(data.get("bookPages")) || 0,
      dueDate: data.get("dueDate")
    }),
    notes: data.get("notes").trim(),
    actualHours: 0,
    actualPages: 0,
    progress: 0,
    completed: false,
    createdAt: new Date().toISOString()
  };

  state.items.unshift(item);
  saveState();
  form.reset();
  repeatPresetInput.value = "none";
  repeatIntervalInput.value = 2;
  repeatUnitInput.value = "day";
  syncRepeatControls();
  renderPlannerInsight();
  if (!timerCourseSelect.value) {
    timer.selectedItemId = item.id;
  }
  resetTimer();
  render();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizePomodoroSettings(settings) {
  return {
    focusMinutes: clampNumber(settings?.focusMinutes, 5, 120, defaultState.timerSettings.focusMinutes),
    breakMinutes: clampNumber(settings?.breakMinutes, 1, 60, defaultState.timerSettings.breakMinutes),
    dailyTargetMinutes: clampNumber(settings?.dailyTargetMinutes, 10, 720, defaultState.timerSettings.dailyTargetMinutes)
  };
}

function startTimer() {
  if (timer.running) return;
  timer.running = true;
  syncTimerWithSelection(false);
  timer.selectedItemId = timerCourseSelect.value;
  timerStage.textContent = getTimerStageLabel(timer.mode === "focus" ? "inProgress" : "break");
  timer.intervalId = window.setInterval(() => {
    timer.secondsLeft -= 1;
    if (timer.secondsLeft <= 0) {
      completeTimerStage();
    }
    renderTimer();
    renderHeroMetrics();
    renderReports();
  }, 1000);
  renderTimer();
}

function pauseTimer() {
  if (!timer.running) return;
  timer.running = false;
  window.clearInterval(timer.intervalId);
  timer.intervalId = null;
  timerStage.textContent = getTimerStageLabel(timer.mode === "focus" ? "paused" : "breakPaused");
}

function resetTimer() {
  timer.running = false;
  window.clearInterval(timer.intervalId);
  timer.intervalId = null;
  timer.mode = "focus";
  timer.secondsLeft = getActiveTimerSettings().focusMinutes * 60;
  timer.selectedItemId = timerCourseSelect.value;
  timerStage.textContent = getTimerStageLabel("ready");
  renderTimer();
}

function skipStage() {
  completeTimerStage(true);
}

function completeTimerStage(skipped = false) {
  if (timer.intervalId) {
    window.clearInterval(timer.intervalId);
    timer.intervalId = null;
  }
  const finishedMode = timer.mode;
  timer.running = false;

  if (finishedMode === "focus" && !skipped) {
    const completedItemId = timer.selectedItemId || timerCourseSelect.value || "";
    const activeSettings = getActiveTimerSettings();
    state.sessions.push({
      id: makeId(),
      minutes: activeSettings.focusMinutes,
      completedAt: new Date().toISOString(),
      itemId: completedItemId
    });

    if (completedItemId) {
      state.items = state.items.map((item) => (
        item.id === completedItemId
          ? applyCompletedPomodoroToItem(item, activeSettings.focusMinutes)
          : item
      ));
    }

    saveState();
  }

  timer.mode = finishedMode === "focus" ? "break" : "focus";
  timer.secondsLeft = (timer.mode === "focus" ? getActiveTimerSettings().focusMinutes : getActiveTimerSettings().breakMinutes) * 60;
  timerStage.textContent = getTimerStageLabel(timer.mode === "focus" ? "ready" : "breakReady");
  render();
}

function render() {
  renderTimerCourseOptions();
  renderTimerSettingsSummary();
  renderTimelineHeader();
  renderItems();
  renderHeroMetrics();
  renderReports();
  renderTimer();
}

function renderItems() {
  const filteredItems = getFilteredItems();

  if (!filteredItems.length) {
    itemsList.innerHTML = '<div class="empty-state">No study items in this time window yet. Add a new item or switch the view above.</div>';
    return;
  }

  const template = document.getElementById("itemCardTemplate");
  itemsList.innerHTML = "";

  const sortedItems = [...filteredItems].sort((a, b) => a.occurrenceDate - b.occurrenceDate);

  sortedItems.forEach(({ item, occurrenceDate }) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".item-card");
    const pill = fragment.querySelector(".item-pill");
    const title = fragment.querySelector("h3");
    const course = fragment.querySelector(".item-course");
    const meta = fragment.querySelector(".item-meta");
    const actualHours = fragment.querySelector(".actual-hours");
    const actualPages = fragment.querySelector(".actual-pages");
    const progressRange = fragment.querySelector(".progress-range");
    const progressValue = fragment.querySelector(".progress-value");
    const completedToggle = fragment.querySelector(".completed-toggle");
    const saveButton = fragment.querySelector(".save-item");
    const deleteButton = fragment.querySelector(".delete-btn");

    card.dataset.itemId = item.id;
    pill.textContent = item.type;
    title.textContent = getItemTitle(item);
    course.textContent = item.course;
    meta.textContent = buildItemMeta(item, occurrenceDate);
    actualHours.value = formatHoursValue(getDisplayedActualHours(item));
    actualPages.value = item.actualPages;
    progressRange.value = item.progress;
    progressValue.textContent = `${item.progress}% complete`;
    completedToggle.checked = item.completed;

    progressRange.addEventListener("input", () => {
      progressValue.textContent = `${progressRange.value}% complete`;
    });

    saveButton.addEventListener("click", () => {
      state.items = state.items.map((entry) => (
        entry.id === item.id
          ? {
              ...entry,
              actualPages: Number(actualPages.value) || 0,
              progress: Number(progressRange.value) || 0,
              completed: completedToggle.checked
            }
          : entry
      ));
      saveState();
      render();
    });

    deleteButton.addEventListener("click", () => {
      state.items = state.items.filter((entry) => entry.id !== item.id);
      saveState();
      render();
    });

    if (item.completed) {
      card.style.opacity = "0.72";
    }

    itemsList.appendChild(fragment);
  });
}

function buildItemMeta(item, occurrenceDate) {
  const segments = [];
  if (item.plannedHours) segments.push(`Plan ${item.plannedHours}h`);
  if (item.plannedPages) segments.push(`${item.plannedPages} pages`);
  if (item.bookPages) segments.push(`Book ${item.bookPages} pages`);
  segments.push(`Due ${formatDateObject(occurrenceDate ?? new Date(`${item.dueDate}T00:00:00`))}`);
  const pomodoro = normalizePomodoroSettings(item.pomodoro);
  segments.push(`Pomodoro ${pomodoro.focusMinutes}/${pomodoro.breakMinutes}`);
  if (item.bookEstimate?.shortSummary) segments.push(item.bookEstimate.shortSummary);
  if (item.repeat) segments.push(describeRepeat(item.repeat));
  if (item.notes) segments.push(item.notes);
  return segments.join(" | ");
}

function renderHeroMetrics() {
  const filteredItems = getFilteredItems().map((entry) => entry.item);
  const totalPlannedHours = sum(filteredItems, (item) => item.plannedHours);
  const totalActualHours = sum(filteredItems, (item) => getDisplayedActualHours(item));
  const pendingItems = filteredItems.filter((item) => !item.completed).length;
  const studyMinutesToday = getMinutesForRange("day");

  const cards = [
    { label: "Planned hours", value: totalPlannedHours.toFixed(1) },
    { label: "Hours studied", value: totalActualHours.toFixed(1) },
    { label: "Pending items", value: pendingItems },
    { label: "Focus mins today", value: studyMinutesToday + getLiveFocusMinutes() }
  ];

  heroMetrics.innerHTML = cards.map((card) => `
    <div class="metric-card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </div>
  `).join("");
}

function renderTimelineHeader() {
  const details = getViewDetails(activeView);
  planWindowTitle.textContent = details.title;
  planWindowSubtitle.textContent = details.subtitle;

  [...timelineControls.querySelectorAll(".timeline-btn")].forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
}

function renderReports() {
  const dailyMinutes = getDisplayMinutesForRange("day");
  const weeklyMinutes = getDisplayMinutesForRange("week");
  const monthlyMinutes = getDisplayMinutesForRange("month");
  const yearlyMinutes = getDisplayMinutesForRange("year");
  const completedItems = state.items.filter((item) => item.completed).length;
  const completionRate = state.items.length ? Math.round((completedItems / state.items.length) * 100) : 0;
  const dailyTargetMinutes = getActiveTimerSettings().dailyTargetMinutes;
  const todayAchievement = Math.min(100, Math.round((dailyMinutes / dailyTargetMinutes) * 100));

  const cards = [
    { label: "Daily achievement", value: `${todayAchievement}%` },
    { label: "Weekly focus", value: `${weeklyMinutes} mins` },
    { label: "Monthly focus", value: `${monthlyMinutes} mins` },
    { label: "Yearly focus", value: `${yearlyMinutes} mins` },
    { label: "Tasks completed", value: completedItems },
    { label: "Completion rate", value: `${completionRate}%` }
  ];

  reportCards.innerHTML = cards.map((card) => `
    <div class="report-card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </div>
  `).join("");

  todayProgressText.textContent = `${dailyMinutes} / ${dailyTargetMinutes} mins | ${todayAchievement}%`;
  todayProgressBar.style.width = `${todayAchievement}%`;

  renderFocusTrend();
  renderTypeBreakdown();
}

function renderFocusTrend() {
  const days = [...Array(7)].map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const label = date.toLocaleDateString([], { weekday: "short" });
    let minutes = state.sessions
      .filter((session) => isSameDay(new Date(session.completedAt), date))
      .reduce((total, session) => total + session.minutes, 0);
    if (isSameDay(date, new Date())) {
      minutes += getLiveFocusMinutes();
    }
    return { label, minutes };
  });

  const highest = Math.max(...days.map((day) => day.minutes), 1);
  focusTrend.innerHTML = days.map((day) => `
    <div class="bar">
      <strong>${day.minutes}</strong>
      <div class="bar-fill" style="height: ${Math.max(12, (day.minutes / highest) * 160)}px"></div>
      <span>${day.label}</span>
    </div>
  `).join("");
}

function renderTypeBreakdown() {
  const filteredItems = getFilteredItems().map((entry) => entry.item);

  if (!filteredItems.length) {
    typeBreakdown.innerHTML = '<div class="empty-state">Add study items to see your workload balance.</div>';
    return;
  }

  const colors = {
    Study: "#ff9f5a",
    Assignment: "#54c3be",
    Project: "#7aa2ff",
    Exam: "#f26b9c"
  };

  const totals = filteredItems.reduce((accumulator, item) => {
    accumulator[item.type] = (accumulator[item.type] || 0) + 1;
    return accumulator;
  }, {});

  const entries = Object.entries(totals);
  const totalCount = filteredItems.length;

  const gradientStops = entries.map(([type, count], index) => {
    const start = entries
      .slice(0, index)
      .reduce((sum, [, innerCount]) => sum + (innerCount / totalCount) * 100, 0);
    const end = start + (count / totalCount) * 100;
    const color = colors[type] ?? "#999";
    return `${color} ${start}% ${end}%`;
  }).join(", ");

  const legend = entries.map(([type, count]) => `
    <div class="legend-item">
      <div class="legend-label">
        <span class="legend-swatch" style="background:${colors[type] ?? "#999"}"></span>
        <strong>${type}</strong>
      </div>
      <span>${count} items | ${Math.round((count / totalCount) * 100)}%</span>
    </div>
  `).join("");

  typeBreakdown.innerHTML = `
    <div class="doughnut-chart" style="background: conic-gradient(${gradientStops})">
      <div class="doughnut-center">
        <strong>${totalCount}</strong>
        <span>Total items</span>
      </div>
    </div>
    <div class="doughnut-legend">${legend}</div>
  `;
}

function renderTimer() {
  timerDisplay.textContent = formatClock(timer.secondsLeft);
  updateLiveItemDisplays();
  const liveDailyMinutes = getDisplayMinutesForRange("day");
  const dailyTargetMinutes = getActiveTimerSettings().dailyTargetMinutes;
  const liveDailyPercent = Math.min(100, Math.round((liveDailyMinutes / dailyTargetMinutes) * 100));
  todayProgressText.textContent = `${liveDailyMinutes} / ${dailyTargetMinutes} mins | ${liveDailyPercent}%`;
  todayProgressBar.style.width = `${liveDailyPercent}%`;

  if (!timer.running && timer.mode === "focus" && timer.secondsLeft === getActiveTimerSettings().focusMinutes * 60) {
    timerStage.textContent = getTimerStageLabel("ready");
  }
  if (!timer.running && timer.mode === "break" && timer.secondsLeft === getActiveTimerSettings().breakMinutes * 60) {
    timerStage.textContent = getTimerStageLabel("breakReady");
  }
}

function renderTimerCourseOptions() {
  const currentValue = timerCourseSelect.value || timer.selectedItemId;
  const options = state.items.map((item) => {
    const label = `${item.course} - ${getItemTitle(item)}`;
    return `<option value="${item.id}">${escapeHtml(label)}</option>`;
  }).join("");

  timerCourseSelect.innerHTML = `<option value="">Choose a course or task</option>${options}`;

  if (state.items.some((item) => item.id === currentValue)) {
    timerCourseSelect.value = currentValue;
  } else {
    const fallbackItem = state.items[0];
    timerCourseSelect.value = fallbackItem?.id ?? "";
    timer.selectedItemId = fallbackItem?.id ?? "";
  }
}

function getTimerStageLabel(stateKey) {
  const selectedItem = getSelectedTimerItem();
  const focusLabel = selectedItem ? `${selectedItem.course} - ${getItemTitle(selectedItem)}` : "your selected study item";

  if (stateKey === "inProgress") return `Focus session in progress for ${focusLabel}`;
  if (stateKey === "paused") return `Focus session paused for ${focusLabel}`;
  if (stateKey === "break") return "Break in progress";
  if (stateKey === "breakPaused") return "Break paused";
  if (stateKey === "breakReady") return "Break ready";
  return selectedItem ? `Ready for ${focusLabel}` : "Ready for a focus session";
}

function renderTimerSettingsSummary() {
  const settings = getActiveTimerSettings();
  timerSettingsSummary.innerHTML = [
    { label: "Focus mins", value: settings.focusMinutes },
    { label: "Break mins", value: settings.breakMinutes },
    { label: "Daily target", value: `${settings.dailyTargetMinutes} mins` }
  ].map((entry) => `
    <div class="timer-setting-card">
      <span>${entry.label}</span>
      <strong>${entry.value}</strong>
    </div>
  `).join("");
}

function handleTimerCourseChange() {
  timer.selectedItemId = timerCourseSelect.value;
  syncTimerWithSelection(true);
  render();
}

function syncTimerWithSelection(resetStage = false) {
  const settings = getActiveTimerSettings();
  if (timer.mode === "focus") {
    timer.secondsLeft = settings.focusMinutes * 60;
  } else {
    timer.secondsLeft = settings.breakMinutes * 60;
  }

  if (resetStage) {
    timer.running = false;
    window.clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.mode = "focus";
    timer.secondsLeft = settings.focusMinutes * 60;
  }
}

function getSelectedTimerItem() {
  const itemId = timerCourseSelect.value || timer.selectedItemId;
  return state.items.find((item) => item.id === itemId) ?? null;
}

function getActiveTimerSettings() {
  return normalizePomodoroSettings(getSelectedTimerItem()?.pomodoro);
}

function getMinutesForRange(range) {
  const now = new Date();
  let start = new Date(now);

  if (range === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === "year") {
    start = new Date(now.getFullYear(), 0, 1);
  }

  return state.sessions
    .filter((session) => new Date(session.completedAt) >= start)
    .reduce((total, session) => total + session.minutes, 0);
}

function getDisplayMinutesForRange(range) {
  return getMinutesForRange(range) + getLiveFocusMinutes();
}

function getLiveFocusMinutes() {
  if (!timer.running || timer.mode !== "focus") return 0;
  const totalFocusSeconds = getActiveTimerSettings().focusMinutes * 60;
  const elapsedSeconds = Math.max(0, totalFocusSeconds - timer.secondsLeft);
  return Math.floor(elapsedSeconds / 60);
}

function getLiveFocusHoursForItem(itemId) {
  if (!timer.running || timer.mode !== "focus") return 0;
  const selectedItemId = timer.selectedItemId || timerCourseSelect.value;
  if (selectedItemId !== itemId) return 0;
  return Number((getLiveFocusMinutes() / 60).toFixed(2));
}

function getDisplayedActualHours(item) {
  return Number((item.actualHours + getLiveFocusHoursForItem(item.id)).toFixed(2));
}

function updateLiveItemDisplays() {
  document.querySelectorAll(".item-card").forEach((card) => {
    const itemId = card.dataset.itemId;
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const actualHoursInput = card.querySelector(".actual-hours");
    if (actualHoursInput) {
      actualHoursInput.value = formatHoursValue(getDisplayedActualHours(item));
    }
  });
}

function sum(items, accessor) {
  return items.reduce((total, item) => total + accessor(item), 0);
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function handleTimelineChange(event) {
  const button = event.target.closest(".timeline-btn");
  if (!button) return;
  activeView = button.dataset.view;
  render();
}

function getFilteredItems() {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return state.items
    .map((item) => {
      const occurrenceDate = getOccurrenceForView(item, activeView, today, tomorrow, now);
      return occurrenceDate ? { item, occurrenceDate } : null;
    })
    .filter(Boolean);
}

function getViewDetails(view) {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (view === "today") {
    return {
      title: `Today | ${formatLongDate(today)}`,
      subtitle: "Viewing items due today."
    };
  }
  if (view === "tomorrow") {
    return {
      title: `Tomorrow | ${formatLongDate(tomorrow)}`,
      subtitle: "Viewing items due tomorrow."
    };
  }
  if (view === "month") {
    return {
      title: now.toLocaleDateString([], { month: "long", year: "numeric" }),
      subtitle: "Viewing items due this month."
    };
  }
  if (view === "year") {
    return {
      title: String(now.getFullYear()),
      subtitle: "Viewing items due this year."
    };
  }
  return {
    title: "All Plans",
    subtitle: "Viewing every saved item."
  };
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function getOccurrenceForView(item, view, today, tomorrow, now) {
  const dueDate = startOfDay(new Date(`${item.dueDate}T00:00:00`));
  const repeat = normalizeRepeat(item.repeat);

  if (!repeat) {
    if (view === "today") return isSameDay(dueDate, today) ? dueDate : null;
    if (view === "tomorrow") return isSameDay(dueDate, tomorrow) ? dueDate : null;
    if (view === "month") {
      return dueDate.getFullYear() === now.getFullYear() && dueDate.getMonth() === now.getMonth() ? dueDate : null;
    }
    if (view === "year") {
      return dueDate.getFullYear() === now.getFullYear() ? dueDate : null;
    }
    return dueDate;
  }

  if (view === "today") {
    return matchesRecurringDate(dueDate, today, repeat) ? today : null;
  }
  if (view === "tomorrow") {
    return matchesRecurringDate(dueDate, tomorrow, repeat) ? tomorrow : null;
  }
  if (view === "month") {
    return findFirstRecurringInRange(
      dueDate,
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
      repeat
    );
  }
  if (view === "year") {
    return findFirstRecurringInRange(
      dueDate,
      new Date(now.getFullYear(), 0, 1),
      new Date(now.getFullYear(), 11, 31),
      repeat
    );
  }
  return getNextOccurrenceOnOrAfter(dueDate, today, repeat) ?? dueDate;
}

function buildRepeatConfig(data) {
  const preset = data.get("repeatPreset");
  if (preset === "none") return null;
  if (preset === "daily") return { interval: 1, unit: "day" };
  if (preset === "weekly") return { interval: 1, unit: "week" };
  if (preset === "monthly") return { interval: 1, unit: "month" };
  if (preset === "yearly") return { interval: 1, unit: "year" };
  return {
    interval: Math.max(1, Number(data.get("repeatInterval")) || 1),
    unit: data.get("repeatUnit")
  };
}

function normalizeRepeat(repeat) {
  if (!repeat?.interval || !repeat?.unit) return null;
  return {
    interval: Math.max(1, Number(repeat.interval) || 1),
    unit: repeat.unit
  };
}

function describeRepeat(repeat) {
  const normalized = normalizeRepeat(repeat);
  if (!normalized) return "";
  if (normalized.interval === 1) {
    return `Repeats ${normalized.unit}ly`.replace("dayly", "daily");
  }
  return `Every ${normalized.interval} ${pluralizeUnit(normalized.unit, normalized.interval)}`;
}

function pluralizeUnit(unit, count) {
  return count === 1 ? unit : `${unit}s`;
}

function matchesRecurringDate(startDate, targetDate, repeat) {
  if (targetDate < startDate) return false;

  if (repeat.unit === "day") {
    return diffInDays(startDate, targetDate) % repeat.interval === 0;
  }
  if (repeat.unit === "week") {
    return diffInDays(startDate, targetDate) % (repeat.interval * 7) === 0;
  }
  if (repeat.unit === "month") {
    const monthDiff = diffInMonths(startDate, targetDate);
    return monthDiff >= 0
      && monthDiff % repeat.interval === 0
      && targetDate.getDate() === clampDay(targetDate.getFullYear(), targetDate.getMonth(), startDate.getDate());
  }
  const yearDiff = targetDate.getFullYear() - startDate.getFullYear();
  return yearDiff >= 0
    && yearDiff % repeat.interval === 0
    && targetDate.getMonth() === startDate.getMonth()
    && targetDate.getDate() === clampDay(targetDate.getFullYear(), startDate.getMonth(), startDate.getDate());
}

function findFirstRecurringInRange(startDate, rangeStart, rangeEnd, repeat) {
  const cursor = startOfDay(rangeStart > startDate ? rangeStart : startDate);
  const end = startOfDay(rangeEnd);

  while (cursor <= end) {
    if (matchesRecurringDate(startDate, cursor, repeat)) {
      return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

function getNextOccurrenceOnOrAfter(startDate, targetDate, repeat) {
  const cursor = startOfDay(targetDate > startDate ? targetDate : startDate);
  const limit = new Date(cursor);
  limit.setFullYear(limit.getFullYear() + 3);

  while (cursor <= limit) {
    if (matchesRecurringDate(startDate, cursor, repeat)) {
      return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

function diffInDays(first, second) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(second) - startOfDay(first)) / msPerDay);
}

function diffInMonths(first, second) {
  return (second.getFullYear() - first.getFullYear()) * 12 + (second.getMonth() - first.getMonth());
}

function clampDay(year, month, day) {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

function applyCompletedPomodoroToItem(item, focusMinutes) {
  const addedHours = focusMinutes / 60;
  const actualHours = Number((item.actualHours + addedHours).toFixed(2));
  const plannedHours = item.plannedHours || 0;
  const autoProgress = plannedHours > 0 ? Math.round(Math.min(100, (actualHours / plannedHours) * 100)) : item.progress;
  const progress = Math.max(item.progress || 0, autoProgress || 0);
  const completed = item.completed || (plannedHours > 0 && actualHours >= plannedHours);

  return {
    ...item,
    actualHours,
    progress,
    completed
  };
}


function formatHoursValue(value) {
  return Number(value).toFixed(2);
}

function buildBookEstimate(input) {
  if (!input.dueDate) return null;
  const dueDate = startOfDay(new Date(`${input.dueDate}T00:00:00`));
  if (Number.isNaN(dueDate.getTime())) return null;

  const today = startOfDay(new Date());
  const totalDays = diffInDays(today, dueDate) + 1;
  if (totalDays <= 0) {
    return {
      summary: "Choose a due date in the future for a book estimate.",
      shortSummary: "Pick a future date"
    };
  }

  const detailParts = [];
  if (input.bookPages > 0) {
    detailParts.push(`${Math.ceil(input.bookPages / totalDays)} pages/day`);
    detailParts.push(`${Math.ceil(input.bookPages / Math.max(1, Math.ceil(totalDays / 7)))} pages/week`);
  }
  if (input.plannedHours > 0) {
    detailParts.push(`${formatHoursValue(input.plannedHours / totalDays)}h/day`);
    detailParts.push(`${formatHoursValue((input.plannedHours / totalDays) * 7)}h/week`);
  }

  if (!detailParts.length) return null;

  return {
    summary: `To finish by ${formatDateObject(dueDate)}, aim for ${detailParts.join(", ")}.`,
    shortSummary: detailParts.slice(0, 2).join(", ")
  };
}

function formatDate(value) {
  return formatDateObject(new Date(`${value}T00:00:00`));
}

function formatDateObject(value) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatLongDate(value) {
  return new Date(value).toLocaleDateString([], {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function isSameDay(first, second) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function getItemTitle(item) {
  return item.title || `${item.type} plan`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function makeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

