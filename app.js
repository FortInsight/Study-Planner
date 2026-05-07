const STORAGE_KEY = "study-planner-dashboard-v1";

const AUTH_STORAGE_KEY = "study-planner-auth-v1";
const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = createSupabaseClient();

const defaultState = {
  items: [],
  sessions: [],
  timerSettings: {
    focusMinutes: 25,
    breakMinutes: 5,
    dailyTargetMinutes: 120,
    alertMode: "ring",
    alertSound: "phone"
  },
  timerSession: null
};

function createDefaultTimer() {
  const restored = buildTimerFromSession(state?.timerSession);
  if (restored) {
    return restored;
  }

  return {
    intervalId: null,
    mode: "focus",
    secondsLeft: state.timerSettings.focusMinutes * 60,
    running: false,
    selectedItemId: "",
    stageEndsAt: null,
    pausedSecondsLeft: null
  };
}

let authState = loadAuthState();
let state = loadState();
let timer = createDefaultTimer();

const authShell = document.getElementById("authShell");
const appShell = document.getElementById("appShell");
const authForm = document.getElementById("authForm");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authMessage = document.getElementById("authMessage");
const currentUsername = document.getElementById("currentUsername");
const authToggleButton = document.getElementById("authToggleButton");
const logoutButton = document.getElementById("logoutButton");
const forgotPasswordButton = document.getElementById("forgotPasswordButton");
const form = document.getElementById("plannerForm");
const editingItemIdInput = document.getElementById("editingItemId");
const existingPlanField = document.getElementById("existingPlanField");
const existingPlanIdInput = document.getElementById("existingPlanId");
const createPlanModeButton = document.getElementById("createPlanModeButton");
const updatePlanModeButton = document.getElementById("updatePlanModeButton");
const savePlanButton = document.getElementById("savePlanButton");
const plannerSaveStatus = document.getElementById("plannerSaveStatus");
const itemsList = document.getElementById("itemsList");
const heroMetrics = document.getElementById("heroMetrics");
const reportCards = document.getElementById("reportCards");
const focusTrend = document.getElementById("focusTrend");
const focusTrendSubtitle = document.getElementById("focusTrendSubtitle");
const trendFilterControls = document.getElementById("trendFilterControls");
const focusTrendDateFilter = document.getElementById("focusTrendDateFilter");
const typeBreakdown = document.getElementById("typeBreakdown");
const timerDisplay = document.getElementById("timerDisplay");
const timerStage = document.getElementById("timerStage");
const timerSettingsSummary = document.getElementById("timerSettingsSummary");
const startTimerButton = document.getElementById("startTimer");
const testAlertButton = document.getElementById("testAlertButton");
const resetTimerButton = document.getElementById("resetTimer");
const todayProgressText = document.getElementById("todayProgressText");
const todayProgressBar = document.getElementById("todayProgressBar");
const planWindowTitle = document.getElementById("planWindowTitle");
const planWindowSubtitle = document.getElementById("planWindowSubtitle");
const timelineControls = document.getElementById("timelineControls");
const timelinePrevButton = document.getElementById("timelinePrevButton");
const timelineNextButton = document.getElementById("timelineNextButton");
const timerCourseSelect = document.getElementById("timerCourseSelect");
const repeatPresetInput = document.getElementById("repeatPreset");
const contentUnitTypeInput = document.getElementById("contentUnitType");
const customContentLabelField = document.getElementById("customContentLabelField");
const upcomingWindowEyebrow = document.getElementById("upcomingWindowEyebrow");
const upcomingWindowTitle = document.getElementById("upcomingWindowTitle");
const upcomingWindowSubtitle = document.getElementById("upcomingWindowSubtitle");
const upcomingDateFilter = document.getElementById("upcomingDateFilter");
const debugGrid = document.getElementById("debugGrid");

let activeView = "today";
let authPanelCollapsed = Boolean(getCurrentUser());
let planEditorMode = "create";
let trendView = "week";
let viewCursor = startOfDay(new Date());
let trendCursor = startOfDay(new Date());
let saveFeedbackByItemId = {};
let debugStatus = {
  userEmail: "",
  userId: "",
  taskLoadCount: 0,
  latestSaveStatus: "No task save yet",
  latestSupabaseError: "None"
};

startTimerButton.addEventListener("click", handlePrimaryTimerAction);
testAlertButton.addEventListener("click", testCurrentAlert);
resetTimerButton.addEventListener("click", resetTimer);
authForm.addEventListener("submit", handleLogin);
document.getElementById("registerButton").addEventListener("click", handleRegister);
forgotPasswordButton.addEventListener("click", handleForgotPassword);
authToggleButton.addEventListener("click", toggleAuthPanel);
logoutButton.addEventListener("click", handleLogout);
form.addEventListener("submit", handleAddItem);
existingPlanIdInput.addEventListener("change", handleExistingPlanSelection);
createPlanModeButton.addEventListener("click", setCreatePlanMode);
updatePlanModeButton.addEventListener("click", setUpdatePlanMode);
timelineControls.addEventListener("click", handleTimelineChange);
timelinePrevButton.addEventListener("click", () => shiftTimelineWindow(-1));
timelineNextButton.addEventListener("click", () => shiftTimelineWindow(1));
trendFilterControls.addEventListener("click", handleTrendFilterChange);
timerCourseSelect.addEventListener("change", handleTimerCourseChange);
upcomingDateFilter.addEventListener("change", handleUpcomingDateFilterChange);
contentUnitTypeInput.addEventListener("change", syncCustomContentField);
focusTrendDateFilter.addEventListener("change", handleFocusTrendDateFilterChange);
document.addEventListener("visibilitychange", handleTimerVisibilityChange);
window.addEventListener("focus", handleTimerVisibilityChange);

registerServiceWorker();
initializeAuth();

function loadAuthState() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    return {
      currentUser: stored?.currentUser ?? ""
    };
  } catch (error) {
    return {
      currentUser: ""
    };
  }
}

function loadState() {
  const storageKey = getPlannerStorageKey();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return {
      items: (stored?.items ?? defaultState.items).map((item) => ({
        ...item,
        pomodoro: normalizePomodoroSettings(item.pomodoro)
      })),
      sessions: stored?.sessions ?? defaultState.sessions,
      timerSettings: {
        ...defaultState.timerSettings,
        ...(stored?.timerSettings ?? {})
      },
      timerSession: normalizeTimerSession(stored?.timerSession)
    };
  } catch (error) {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState() {
  localStorage.setItem(getPlannerStorageKey(), JSON.stringify(state));
}

function saveAuthState() {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

async function handleRegister() {
  if (!supabaseClient) {
    authMessage.textContent = "Supabase is not configured yet. Add the URL and anon key in supabase-config.js first.";
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();

  if (!email || !password) {
    authMessage.textContent = "Add both an email and password to create your account.";
    return;
  }

  authMessage.textContent = "Creating your account...";
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    authMessage.textContent = error.message;
    return;
  }

  if (data.session?.user?.email) {
    await ensureSupabaseProfile(data.session.user);
    await applySignedInUser(data.session.user.email, data.session.user);
    authMessage.textContent = "Account created and signed in.";
    authForm.reset();
    focusMainApp();
    return;
  }

  applySignedOutUser();
  authMessage.textContent = "Account created. Check your email if confirmation is required before sign in.";
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabaseClient) {
    authMessage.textContent = "Supabase is not configured yet. Add the URL and anon key in supabase-config.js first.";
    return;
  }

  const data = new FormData(authForm);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "").trim();

  if (!email || !password) {
    authMessage.textContent = "Add both your email and password to sign in.";
    return;
  }

  authMessage.textContent = "Signing you in...";
  const { data: signInData, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    authMessage.textContent = error.message;
    return;
  }

  await ensureSupabaseProfile(signInData.user);
  await applySignedInUser(signInData.user?.email || email, signInData.user);
  authMessage.textContent = "Signed in.";
  authForm.reset();
  focusMainApp();
}

async function handleForgotPassword() {
  if (!supabaseClient) {
    authMessage.textContent = "Supabase is not configured yet. Add the URL and anon key in supabase-config.js first.";
    return;
  }

  const email = authEmailInput.value.trim();
  if (!email) {
    authMessage.textContent = "Enter your email first, then use forgot password.";
    return;
  }

  const options = {};
  const redirectTo = getPasswordResetRedirect();
  if (redirectTo) {
    options.redirectTo = redirectTo;
  }

  authMessage.textContent = "Sending password reset email...";
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, options);

  if (error) {
    authMessage.textContent = error.message;
    return;
  }

  authMessage.textContent = redirectTo
    ? "Password reset email sent. Check your inbox for the reset link."
    : "Password reset email sent. Reset links work best when this app runs from localhost or a hosted URL.";
}

async function handleLogout() {
  pauseTimer();
  if (!supabaseClient) {
    applySignedOutUser();
    authMessage.textContent = "Signed out.";
    return;
  }

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    authMessage.textContent = error.message;
    return;
  }

  applySignedOutUser();
  authMessage.textContent = "Signed out. Sign in again or create another account.";
}

function toggleAuthPanel() {
  authPanelCollapsed = !authPanelCollapsed;
  render();
  if (!authPanelCollapsed) {
    authEmailInput.focus();
  }
}

async function initializeAuth() {
  if (!supabaseClient) {
    authState.currentUser = "";
    saveAuthState();
    authPanelCollapsed = false;
    authMessage.textContent = "Add your Supabase URL and anon key in supabase-config.js to enable email sign in.";
    render();
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      authMessage.textContent = error.message;
    }

    const sessionEmail = data?.session?.user?.email || "";
    if (sessionEmail) {
      await ensureSupabaseProfile(data.session.user);
      await applySignedInUser(sessionEmail, data.session.user, { silent: true });
    } else {
      applySignedOutUser({ silent: true });
    }
  } catch (error) {
    authMessage.textContent = "We could not initialize Supabase sign in right now.";
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    const nextEmail = session?.user?.email || "";
    if (nextEmail) {
      await ensureSupabaseProfile(session.user);
      await applySignedInUser(nextEmail, session.user, { silent: true });
      render();
      return;
    }

    applySignedOutUser({ silent: true });
    render();
  });

  render();
}

async function applySignedInUser(email, user = null, options = {}) {
  authState.currentUser = email;
  saveAuthState();
  state = loadState();
  timer = createDefaultTimer();
  authPanelCollapsed = true;
  debugStatus.userEmail = email || "";
  debugStatus.userId = user?.id || debugStatus.userId || "";
  await loadTasksFromSupabase(user, { silent: true });
  if (!options.silent) {
    render();
  }
}

function applySignedOutUser(options = {}) {
  authState.currentUser = "";
  saveAuthState();
  state = JSON.parse(JSON.stringify(defaultState));
  timer = createDefaultTimer();
  authPanelCollapsed = false;
  debugStatus.userEmail = "";
  debugStatus.userId = "";
  debugStatus.taskLoadCount = 0;
  debugStatus.latestSaveStatus = "No task save yet";
  debugStatus.latestSupabaseError = "None";
  if (!options.silent) {
    render();
  }
}

async function ensureSupabaseProfile(user) {
  if (!supabaseClient || !user?.id) {
    return;
  }

  const payload = {
    id: user.id,
    email: user.email || "",
    updated_at: new Date().toISOString()
  };

  const { data: profileData, error: profileError } = await supabaseClient
    .from("profiles")
    .upsert(payload, {
      onConflict: "id"
    })
    .select();

  if (profileError) {
    console.error("Profile upsert error:", profileError);
    window.alert(`Profile save error: ${profileError.message}`);
    return;
  }

  console.log("Profile saved:", profileData);
}

async function loadTasksFromSupabase(user = null, options = {}) {
  if (!supabaseClient || !getCurrentUser()) {
    return;
  }

  const activeUser = user || await getAuthenticatedSupabaseUser();
  if (!activeUser?.id) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("tasks")
    .select("*")
    .eq("user_id", activeUser.id);

  if (error) {
    debugStatus.userEmail = activeUser.email || getCurrentUser();
    debugStatus.userId = activeUser.id || "";
    debugStatus.latestSupabaseError = error.message;
    console.error("Task load error:", error);
    if (!options.silent) {
      window.alert(`Task load error: ${error.message}`);
    }
    return;
  }

  state.items = (data || []).map(deserializeTaskRecord);
  debugStatus.userEmail = activeUser.email || getCurrentUser();
  debugStatus.userId = activeUser.id || "";
  debugStatus.taskLoadCount = data?.length || 0;
  debugStatus.latestSupabaseError = "None";
  saveState();
}

async function saveTaskToSupabase(item, user = null) {
  if (!supabaseClient || !getCurrentUser()) {
    return item;
  }

  const activeUser = user || await getAuthenticatedSupabaseUser();
  if (!activeUser?.id) {
    return item;
  }

  const payload = {
    user_id: activeUser.id,
    title: item.course || item.title || "Study plan",
    description: serializeTaskDescription(item)
  };

  const query = item.remoteTaskId
    ? supabaseClient
      .from("tasks")
      .upsert(
        { id: item.remoteTaskId, ...payload },
        { onConflict: "id" }
      )
      .select()
    : supabaseClient
      .from("tasks")
      .insert(payload)
      .select();

  const { data, error } = await query;

  if (error) {
    debugStatus.userEmail = activeUser.email || getCurrentUser();
    debugStatus.userId = activeUser.id || "";
    debugStatus.latestSaveStatus = "Task save failed";
    debugStatus.latestSupabaseError = error.message;
    console.error("Task save error:", error);
    window.alert(`Task save error: ${error.message}`);
    return item;
  }

  const savedRow = Array.isArray(data) ? data[0] : data;
  debugStatus.userEmail = activeUser.email || getCurrentUser();
  debugStatus.userId = activeUser.id || "";
  debugStatus.latestSaveStatus = `Task saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  debugStatus.latestSupabaseError = "None";
  debugStatus.taskLoadCount = state.items.length;
  return savedRow ? deserializeTaskRecord(savedRow) : item;
}

async function deleteTaskFromSupabase(item, user = null) {
  if (!supabaseClient || !getCurrentUser() || !item?.remoteTaskId) {
    return true;
  }

  const activeUser = user || await getAuthenticatedSupabaseUser();
  if (!activeUser?.id) {
    return false;
  }

  const { error } = await supabaseClient
    .from("tasks")
    .delete()
    .eq("id", item.remoteTaskId)
    .eq("user_id", activeUser.id);

  if (error) {
    debugStatus.userEmail = activeUser.email || getCurrentUser();
    debugStatus.userId = activeUser.id || "";
    debugStatus.latestSupabaseError = error.message;
    console.error("Task delete error:", error);
    window.alert(`Task delete error: ${error.message}`);
    return false;
  }

  debugStatus.userEmail = activeUser.email || getCurrentUser();
  debugStatus.userId = activeUser.id || "";
  debugStatus.latestSaveStatus = `Task deleted ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  debugStatus.latestSupabaseError = "None";
  debugStatus.taskLoadCount = Math.max(0, state.items.length - 1);
  return true;
}

function serializeTaskDescription(item) {
  const payload = { ...item };
  delete payload.remoteTaskId;
  return JSON.stringify({
    version: 1,
    item: payload
  });
}

function deserializeTaskRecord(taskRow) {
  const parsed = parseTaskDescription(taskRow.description);
  const stored = parsed?.item || {};

  return {
    id: stored.id || String(taskRow.id || makeId()),
    remoteTaskId: taskRow.id || stored.remoteTaskId || null,
    course: stored.course || taskRow.title || "Study plan",
    title: stored.title || "",
    type: stored.type || "Study",
    plannedHours: Number(stored.plannedHours ?? taskRow.planned_hours) || 0,
    plannedPages: Number(stored.plannedPages) || 0,
    plannedUnits: Number(stored.plannedUnits) || 0,
    contentUnitType: normalizeContentUnitType(stored.contentUnitType),
    customContentLabel: stored.customContentLabel || "",
    totalContentTarget: Number(stored.totalContentTarget) || 0,
    weekdayContentTarget: Number(stored.weekdayContentTarget) || 0,
    weekendContentTarget: Number(stored.weekendContentTarget) || 0,
    bookPages: Number(stored.bookPages) || 0,
    dueDate: stored.dueDate || formatDateInputValue(new Date()),
    repeat: stored.repeat || null,
    pomodoro: normalizePomodoroSettings(stored.pomodoro),
    actualHours: Number(stored.actualHours) || 0,
    actualContent: Number(stored.actualContent ?? stored.actualPages ?? stored.actualUnits) || 0,
    actualPages: Number(stored.actualPages) || 0,
    actualUnits: Number(stored.actualUnits) || 0,
    contentStart: stored.contentStart || "",
    contentStop: stored.contentStop || "",
    progress: Number(stored.progress) || 0,
    completed: Boolean(stored.completed),
    createdAt: stored.createdAt || taskRow.created_at || new Date().toISOString()
  };
}

function parseTaskDescription(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function getAuthenticatedSupabaseUser() {
  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    console.error("Auth user lookup error:", error);
    debugStatus.latestSupabaseError = error.message;
    return null;
  }

  return data.user || null;
}

async function handleAddItem(event) {
  event.preventDefault();
  if (plannerSaveStatus) {
    plannerSaveStatus.className = "save-status full-span pending";
    plannerSaveStatus.textContent = "Saving plan...";
  }
  const data = new FormData(form);
  const editingItemId = editingItemIdInput.value;
  const existingItem = state.items.find((item) => item.id === editingItemId);
  const contentUnitType = normalizeContentUnitType(String(data.get("contentUnitType") || ""));
  const customContentLabel = String(data.get("customContentLabel") || "").trim();
  const totalContentTarget = Number(data.get("totalContentTarget")) || 0;
  const weekdayContentTarget = Number(data.get("weekdayContentTarget")) || 0;
  const weekendContentTarget = Number(data.get("weekendContentTarget")) || 0;
  const item = {
    id: existingItem?.id || makeId(),
    course: data.get("course").trim(),
    title: "",
    type: "Study",
    plannedHours: Number(data.get("plannedHours")) || 0,
    plannedPages: contentUnitType === "pages" ? totalContentTarget : 0,
    plannedUnits: contentUnitType === "units" ? totalContentTarget : 0,
    contentUnitType,
    customContentLabel,
    totalContentTarget,
    weekdayContentTarget,
    weekendContentTarget,
    bookPages: Number(data.get("bookPages")) || 0,
    dueDate: data.get("dueDate"),
    repeat: buildRepeatConfig(data),
    pomodoro: normalizePomodoroSettings({
      focusMinutes: Number(data.get("itemFocusMinutes")),
      breakMinutes: Number(data.get("itemBreakMinutes")),
      dailyTargetMinutes: Number(data.get("itemDailyTargetMinutes")),
      alertMode: String(data.get("itemAlertMode") || ""),
      alertSound: String(data.get("itemAlertSound") || "")
    }),
    actualHours: existingItem?.actualHours || 0,
    actualContent: existingItem?.actualContent ?? getLegacyActualContent(existingItem),
    actualPages: existingItem?.actualPages || 0,
    actualUnits: existingItem?.actualUnits || 0,
    contentStart: existingItem?.contentStart || "",
    contentStop: existingItem?.contentStop || "",
    progress: existingItem?.progress || 0,
    completed: existingItem?.completed || false,
    createdAt: existingItem?.createdAt || new Date().toISOString()
  };

  item.progress = getDisplayedTimeProgress(item);
  item.completed = isStudyGoalAchieved(item);

  if (existingItem) {
    state.items = state.items.map((entry) => entry.id === existingItem.id ? item : entry);
  } else {
    state.items.unshift(item);
  }
  const savedItem = await saveTaskToSupabase(item);
  state.items = state.items.map((entry) => entry.id === item.id ? savedItem : entry);
  saveState();
  resetPlannerForm();
  if (plannerSaveStatus) {
    plannerSaveStatus.className = "save-status full-span saved";
    plannerSaveStatus.textContent = `${existingItem ? "Plan updated" : "Plan saved"} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  if (!timerCourseSelect.value) {
    timer.selectedItemId = savedItem.id;
  }
  render();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeTimerSession(session) {
  if (!session) return null;

  return {
    mode: session.mode === "break" ? "break" : "focus",
    secondsLeft: Math.max(0, Number(session.secondsLeft) || 0),
    running: Boolean(session.running),
    selectedItemId: session.selectedItemId || "",
    stageEndsAt: session.stageEndsAt ? Number(session.stageEndsAt) : null,
    pausedSecondsLeft: Math.max(0, Number(session.pausedSecondsLeft) || 0)
  };
}

function buildTimerFromSession(session) {
  const normalized = normalizeTimerSession(session);
  if (!normalized) return null;

  return {
    intervalId: null,
    mode: normalized.mode,
    secondsLeft: normalized.secondsLeft,
    running: normalized.running,
    selectedItemId: normalized.selectedItemId,
    stageEndsAt: normalized.stageEndsAt,
    pausedSecondsLeft: normalized.pausedSecondsLeft || null
  };
}

function saveTimerSession() {
  state.timerSession = {
    mode: timer.mode,
    secondsLeft: timer.secondsLeft,
    running: timer.running,
    selectedItemId: timer.selectedItemId,
    stageEndsAt: timer.stageEndsAt,
    pausedSecondsLeft: timer.pausedSecondsLeft
  };
  saveState();
}

function normalizePomodoroSettings(settings) {
  return {
    focusMinutes: clampNumber(settings?.focusMinutes, 5, 120, defaultState.timerSettings.focusMinutes),
    breakMinutes: clampNumber(settings?.breakMinutes, 1, 60, defaultState.timerSettings.breakMinutes),
    dailyTargetMinutes: clampNumber(settings?.dailyTargetMinutes, 10, 720, defaultState.timerSettings.dailyTargetMinutes),
    alertMode: normalizeAlertMode(settings?.alertMode),
    alertSound: normalizeAlertSound(settings?.alertSound)
  };
}

function normalizeAlertMode(value) {
  return ["ring", "vibrate", "both", "off"].includes(value) ? value : "ring";
}

function normalizeAlertSound(value) {
  return ["phone", "bell", "chime", "popcorn"].includes(value) ? value : "phone";
}

function handlePrimaryTimerAction() {
  if (timer.running) {
    pauseTimer();
    return;
  }

  if (timer.pausedSecondsLeft > 0) {
    continueTimer();
    return;
  }

  startTimer();
}

function startTimer() {
  if (timer.running) return;
  timer.selectedItemId = timerCourseSelect.value;
  timer.mode = "focus";
  syncTimerWithSelection(false);
  timer.running = true;
  timer.pausedSecondsLeft = null;
  timer.stageEndsAt = Date.now() + (timer.secondsLeft * 1000);
  timerStage.textContent = getTimerStageLabel(timer.mode === "focus" ? "inProgress" : "break");
  ensureTimerInterval();
  saveTimerSession();
  renderTimer();
}

function continueTimer() {
  if (timer.running || !timer.pausedSecondsLeft) return;
  timer.selectedItemId = timerCourseSelect.value;
  timer.secondsLeft = timer.pausedSecondsLeft;
  timer.running = true;
  timer.pausedSecondsLeft = null;
  timer.stageEndsAt = Date.now() + (timer.secondsLeft * 1000);
  timerStage.textContent = getTimerStageLabel(timer.mode === "focus" ? "inProgress" : "break");
  ensureTimerInterval();
  saveTimerSession();
  renderTimer();
}

function pauseTimer() {
  if (!timer.running) return;
  syncTimerClock();
  timer.running = false;
  window.clearInterval(timer.intervalId);
  timer.intervalId = null;
  timer.pausedSecondsLeft = timer.secondsLeft;
  timer.stageEndsAt = null;
  timerStage.textContent = getTimerStageLabel(timer.mode === "focus" ? "paused" : "breakPaused");
  saveTimerSession();
  renderTimer();
}

function resetTimer() {
  timer.running = false;
  window.clearInterval(timer.intervalId);
  timer.intervalId = null;
  timer.mode = "focus";
  timer.secondsLeft = getActiveTimerSettings().focusMinutes * 60;
  timer.selectedItemId = timerCourseSelect.value;
  timer.pausedSecondsLeft = null;
  timer.stageEndsAt = null;
  timerStage.textContent = getTimerStageLabel("ready");
  saveTimerSession();
  renderTimer();
}

function completeTimerStage() {
  if (timer.intervalId) {
    window.clearInterval(timer.intervalId);
    timer.intervalId = null;
  }
  const finishedMode = timer.mode;
  timer.running = false;

  if (finishedMode === "focus") {
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
      const updatedItem = state.items.find((item) => item.id === completedItemId);
      if (updatedItem) {
        saveTaskToSupabase(updatedItem);
      }
    }

    saveState();
  }
  runCompletionAlert();
  timer.mode = finishedMode;
  timer.secondsLeft = 0;
  timer.pausedSecondsLeft = null;
  timer.stageEndsAt = null;
  timerStage.textContent = finishedMode === "focus" ? "Focus session completed" : "Break completed";
  saveTimerSession();
  render();
}

function setCreatePlanMode() {
  resetPlannerForm();
  const courseInput = form.elements.course;
  if (courseInput) {
    courseInput.focus();
  }
}

function setUpdatePlanMode() {
  planEditorMode = "update";
  renderPlannerMode();
  existingPlanIdInput.focus();
}

function handleExistingPlanSelection() {
  const selectedItem = state.items.find((item) => item.id === existingPlanIdInput.value);
  if (!selectedItem) {
    editingItemIdInput.value = "";
    return;
  }

  planEditorMode = "update";
  populatePlannerForm(selectedItem);
}

function populatePlannerForm(item) {
  editingItemIdInput.value = item.id;
  form.elements.course.value = item.course || "";
  form.elements.plannedHours.value = item.plannedHours || "";
  form.elements.contentUnitType.value = getStoredContentType(item);
  form.elements.customContentLabel.value = item.customContentLabel || "";
  form.elements.totalContentTarget.value = getStoredTotalContentTarget(item) || "";
  form.elements.weekdayContentTarget.value = item.weekdayContentTarget || "";
  form.elements.weekendContentTarget.value = item.weekendContentTarget || "";
  form.elements.bookPages.value = item.bookPages || "";
  form.elements.dueDate.value = item.dueDate || "";
  form.elements.repeatPreset.value = getRepeatPresetValue(item.repeat);
  form.elements.itemFocusMinutes.value = item.pomodoro?.focusMinutes || 25;
  form.elements.itemBreakMinutes.value = item.pomodoro?.breakMinutes || 5;
  form.elements.itemDailyTargetMinutes.value = item.pomodoro?.dailyTargetMinutes || 120;
  form.elements.itemAlertMode.value = item.pomodoro?.alertMode || "ring";
  form.elements.itemAlertSound.value = item.pomodoro?.alertSound || "phone";
  existingPlanIdInput.value = item.id;
  syncCustomContentField();
}

function resetPlannerForm() {
  form.reset();
  editingItemIdInput.value = "";
  existingPlanIdInput.value = "";
  repeatPresetInput.value = "none";
  contentUnitTypeInput.value = "pages";
  syncCustomContentField();
  planEditorMode = "create";
  renderPlannerMode();
}

function renderPlannerMode() {
  const isUpdating = planEditorMode === "update";
  existingPlanField.hidden = !isUpdating;
  createPlanModeButton.classList.toggle("primary-btn", !isUpdating);
  createPlanModeButton.classList.toggle("ghost-btn", isUpdating);
  updatePlanModeButton.classList.toggle("primary-btn", isUpdating);
  updatePlanModeButton.classList.toggle("ghost-btn", !isUpdating);
  savePlanButton.textContent = isUpdating ? "Update study plan" : "Save study item";
  syncExistingPlanOptions();
}

function syncCustomContentField() {
  const isCustom = normalizeContentUnitType(contentUnitTypeInput.value) === "custom";
  customContentLabelField.hidden = !isCustom;
  if (!isCustom) {
    form.elements.customContentLabel.value = "";
  }
}

function syncExistingPlanOptions() {
  const currentValue = existingPlanIdInput.value;
  const options = state.items.map((item) => (
    `<option value="${item.id}">${escapeHtml(item.course)}</option>`
  )).join("");

  existingPlanIdInput.innerHTML = `<option value="">Choose a course plan</option>${options}`;

  if (state.items.some((item) => item.id === currentValue)) {
    existingPlanIdInput.value = currentValue;
  }
}

function render() {
  const signedInUser = getCurrentUser();
  const isSignedIn = Boolean(signedInUser);
  authShell.classList.toggle("collapsed", authPanelCollapsed);
  currentUsername.textContent = signedInUser || "Guest";
  authToggleButton.hidden = isSignedIn;
  authToggleButton.textContent = authPanelCollapsed ? "Show sign in" : "Hide sign in";
  logoutButton.hidden = !isSignedIn;

  syncTimerClock();
  if (timer.running) {
    ensureTimerInterval();
  }

  renderPlannerMode();
  syncCustomContentField();
  renderTimerCourseOptions();
  renderTimerSettingsSummary();
  renderTimelineHeader();
  renderItems();
  renderHeroMetrics();
  renderReports();
  renderTimer();
  renderDebugPanel();
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
    const title = fragment.querySelector("h3");
    const meta = fragment.querySelector(".item-meta");
    const contentStartLabel = fragment.querySelector(".content-start-label");
    const contentStopLabel = fragment.querySelector(".content-stop-label");
    const contentStartInput = fragment.querySelector(".content-start");
    const contentStopInput = fragment.querySelector(".content-stop");
    const contentSummary = fragment.querySelector(".content-summary");
    const progressRange = fragment.querySelector(".progress-range");
    const progressValue = fragment.querySelector(".progress-value");
    const goalStatus = fragment.querySelector(".goal-status");
    const saveStatus = fragment.querySelector(".save-status");
    const saveButton = fragment.querySelector(".save-item");
    const deleteButton = fragment.querySelector(".delete-btn");
    const tracking = getContentTrackingConfig(item);

    card.dataset.itemId = item.id;
    title.textContent = item.course;
    meta.textContent = buildItemMeta(item, occurrenceDate);
    const contentState = getContentProgressState(item);
    contentStartLabel.textContent = tracking.startLabel;
    contentStopLabel.textContent = tracking.stopLabel;
    contentStartInput.value = item.contentStart || "";
    contentStopInput.value = item.contentStop || "";
    contentStartInput.placeholder = tracking.startPlaceholder;
    contentStopInput.placeholder = tracking.stopPlaceholder;
    contentSummary.textContent = contentState.summary;
    const displayedProgress = getDisplayedTimeProgress(item);
    progressRange.value = displayedProgress;
    progressValue.textContent = `${displayedProgress}% time achieved`;
    goalStatus.textContent = isStudyGoalAchieved(item) ? "Study goal achieved" : "Study goal in progress";
    goalStatus.classList.toggle("complete", isStudyGoalAchieved(item));
    goalStatus.classList.toggle("pending", !isStudyGoalAchieved(item));
    applySaveStatus(saveStatus, saveFeedbackByItemId[item.id]);

    const refreshContentSummary = () => {
      const draftAmount = calculateTrackedAmount(
        Number(contentStartInput.value) || 0,
        Number(contentStopInput.value) || 0
      );
      const total = tracking.total || 0;
      const percent = total > 0 ? Math.min(100, Math.round((draftAmount / total) * 100)) : 0;
      contentSummary.textContent = total > 0
        ? `${draftAmount} of ${total} ${tracking.plural} done | ${percent}% achieved`
        : `No ${tracking.plural} target set yet`;
      if (!contentStartInput.value && !contentStopInput.value) {
        contentSummary.textContent = contentState.summary;
      }
      saveFeedbackByItemId[item.id] = {
        tone: "pending",
        text: "Unsaved page or unit change"
      };
      applySaveStatus(saveStatus, saveFeedbackByItemId[item.id]);
    };

    contentStartInput.addEventListener("input", refreshContentSummary);
    contentStopInput.addEventListener("input", refreshContentSummary);

    saveButton.addEventListener("click", async () => {
      const contentStart = Number(contentStartInput.value) || 0;
      const contentStop = Number(contentStopInput.value) || 0;
      const trackedAmount = calculateTrackedAmount(contentStart, contentStop);
      let updatedItem = null;
      state.items = state.items.map((entry) => (
        entry.id === item.id
          ? (updatedItem = buildUpdatedProgressItem(entry, {
            contentStart,
            contentStop,
            trackedAmount
          }))
          : entry
      ));
      updatedItem = await saveTaskToSupabase(updatedItem || item);
      state.items = state.items.map((entry) => entry.id === item.id ? updatedItem : entry);
      saveFeedbackByItemId[item.id] = {
        tone: "saved",
        text: `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      };
      saveState();
      render();
    });

    deleteButton.addEventListener("click", async () => {
      const deleteAllowed = await deleteTaskFromSupabase(item);
      if (!deleteAllowed) {
        return;
      }
      state.items = state.items.filter((entry) => entry.id !== item.id);
      saveState();
      render();
    });

    if (isStudyGoalAchieved(item)) {
      card.style.opacity = "0.72";
    }

    itemsList.appendChild(fragment);
  });
}

function renderDebugPanel() {
  if (!debugGrid) {
    return;
  }

  const cards = [
    { label: "Signed-in user email", value: debugStatus.userEmail || "Not signed in" },
    { label: "Signed-in user id", value: debugStatus.userId || "Unknown" },
    { label: "Task load count", value: String(debugStatus.taskLoadCount ?? 0) },
    { label: "Latest save status", value: debugStatus.latestSaveStatus || "No task save yet" },
    { label: "Latest Supabase error", value: debugStatus.latestSupabaseError || "None" }
  ];

  debugGrid.innerHTML = cards.map((card) => `
    <div class="debug-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
    </div>
  `).join("");
}

function normalizeContentUnitType(value) {
  if (["pages", "chapters", "topics", "units", "custom"].includes(value)) {
    return value;
  }
  return "pages";
}

function toPluralLabel(label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) return "items";
  if (trimmed.endsWith("s")) return trimmed;
  return `${trimmed}s`;
}

function getStoredContentType(item) {
  if (item?.contentUnitType) {
    return normalizeContentUnitType(item.contentUnitType);
  }
  if ((item?.plannedUnits || 0) > 0 && !(item?.plannedPages || 0)) {
    return "units";
  }
  return "pages";
}

function getStoredTotalContentTarget(item) {
  if ((item?.totalContentTarget || 0) > 0) {
    return item.totalContentTarget;
  }
  const contentType = getStoredContentType(item);
  return contentType === "units" ? (item?.plannedUnits || 0) : (item?.plannedPages || 0);
}

function getLegacyActualContent(item) {
  if (!item) return 0;
  const contentType = getStoredContentType(item);
  return contentType === "units" ? (item.actualUnits || 0) : (item.actualPages || 0);
}

function getContentUnitDefinition(item) {
  const contentType = getStoredContentType(item);
  if (contentType === "custom") {
    const singular = String(item.customContentLabel || "").trim() || "item";
    return {
      type: "custom",
      singular,
      plural: toPluralLabel(singular)
    };
  }

  const definitions = {
    pages: { singular: "page", plural: "pages" },
    chapters: { singular: "chapter", plural: "chapters" },
    topics: { singular: "topic", plural: "topics" },
    units: { singular: "unit", plural: "units" }
  };

  return {
    type: contentType,
    ...definitions[contentType]
  };
}

function buildItemMeta(item, occurrenceDate) {
  const segments = [];
  if (item.plannedHours) segments.push(`Plan ${item.plannedHours}h`);
  const pomodoro = normalizePomodoroSettings(item.pomodoro);
  const dailyPlannedHours = pomodoro.dailyTargetMinutes / 60;
  segments.push(
    pomodoro.dailyTargetMinutes % 60 === 0
      ? `Daily ${dailyPlannedHours.toFixed(0)}h`
      : `Daily ${formatMinutesDisplay(pomodoro.dailyTargetMinutes)} mins`
  );
  const contentDefinition = getContentUnitDefinition(item);
  const totalContentTarget = getStoredTotalContentTarget(item);
  if (totalContentTarget) segments.push(`${totalContentTarget} ${contentDefinition.plural}`);
  if (item.weekdayContentTarget) segments.push(`Weekdays ${item.weekdayContentTarget} ${contentDefinition.plural}`);
  if (item.weekendContentTarget) segments.push(`Weekend ${item.weekendContentTarget} ${contentDefinition.plural}`);
  if (item.bookPages) segments.push(`Book ${item.bookPages} pages`);
  segments.push(`Due ${formatDateObject(occurrenceDate ?? new Date(`${item.dueDate}T00:00:00`))}`);
  segments.push(`Pomodoro ${pomodoro.focusMinutes}/${pomodoro.breakMinutes}`);
  if (item.repeat) segments.push(describeRepeat(item.repeat));
  return segments.join(" | ");
}

function getContentTrackingConfig(item) {
  const contentDefinition = getContentUnitDefinition(item);
  const total = getStoredTotalContentTarget(item);
  return {
    type: contentDefinition.type,
    total,
    startLabel: `Start ${contentDefinition.singular}`,
    stopLabel: `Stop ${contentDefinition.singular}`,
    startPlaceholder: "1",
    stopPlaceholder: String(total || item.bookPages || ""),
    singular: contentDefinition.singular,
    plural: contentDefinition.plural
  };
}

function calculateTrackedAmount(start, stop) {
  if (!start || !stop || stop < start) return 0;
  return stop - start + 1;
}

function getContentProgressState(item) {
  const tracking = getContentTrackingConfig(item);
  const total = tracking.total || 0;
  const achieved = item.actualContent ?? getLegacyActualContent(item);
  const percent = total > 0 ? Math.min(100, Math.round((achieved / total) * 100)) : 0;

  if (!total) {
    return {
      percent: 0,
      summary: `No ${tracking.plural} target set yet`
    };
  }

  return {
    percent,
    summary: `${achieved} of ${total} ${tracking.plural} done | ${percent}% achieved`
  };
}

function buildUpdatedProgressItem(item, progressInput) {
  const tracking = getContentTrackingConfig(item);
  const actualPages = tracking.type === "pages" ? progressInput.trackedAmount : item.actualPages;
  const actualUnits = tracking.type === "units" ? progressInput.trackedAmount : item.actualUnits;
  const updatedItem = {
    ...item,
    contentStart: progressInput.contentStart || "",
    contentStop: progressInput.contentStop || "",
    actualContent: progressInput.trackedAmount,
    actualPages,
    actualUnits
  };

  updatedItem.progress = getDisplayedTimeProgress(updatedItem);
  updatedItem.completed = isStudyGoalAchieved(updatedItem);
  return updatedItem;
}

function applySaveStatus(element, feedback) {
  if (!element) return;
  element.textContent = feedback?.text || "";
  element.classList.toggle("saved", feedback?.tone === "saved");
  element.classList.toggle("pending", feedback?.tone === "pending");
}

function renderHeroMetrics() {
  const filteredItems = getFilteredItems().map((entry) => entry.item);
  const totalPlannedHours = sum(filteredItems, (item) => getTimeTargetHours(item));
  const totalActualHours = sum(filteredItems, (item) => getDisplayedActualHours(item));
  const pendingItems = filteredItems.filter((item) => !item.completed).length;
  const studyMinutesToday = getMinutesForRange("day");

  const cards = [
    { label: "Planned hours", value: totalPlannedHours.toFixed(1) },
    { label: "Hours studied", value: totalActualHours.toFixed(1) },
    { label: "Pending items", value: pendingItems },
    { label: "Focus mins today", value: formatMinutesDisplay(studyMinutesToday + getLiveFocusMinutes()) }
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
  const windowRange = getActiveViewRange();
  planWindowTitle.textContent = details.title;
  planWindowSubtitle.textContent = details.subtitle;
  upcomingWindowEyebrow.textContent = details.eyebrow;
  upcomingWindowTitle.textContent = details.listTitle;
  upcomingWindowSubtitle.textContent = details.listSubtitle;
  upcomingDateFilter.value = formatDateInputValue(windowRange.start);
  timelinePrevButton.disabled = activeView === "all";
  timelineNextButton.disabled = activeView === "all";

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
    { label: "Weekly focus", value: `${formatMinutesDisplay(weeklyMinutes)} mins` },
    { label: "Monthly focus", value: `${formatMinutesDisplay(monthlyMinutes)} mins` },
    { label: "Yearly focus", value: `${formatMinutesDisplay(yearlyMinutes)} mins` },
    { label: "Tasks completed", value: completedItems },
    { label: "Completion rate", value: `${completionRate}%` }
  ];

  reportCards.innerHTML = cards.map((card) => `
    <div class="report-card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </div>
  `).join("");

  todayProgressText.textContent = `${formatMinutesDisplay(dailyMinutes)} / ${dailyTargetMinutes} mins | ${todayAchievement}%`;
  todayProgressBar.style.width = `${todayAchievement}%`;

  [...trendFilterControls.querySelectorAll("[data-trend-view]")].forEach((button) => {
    button.classList.toggle("active", button.dataset.trendView === trendView);
  });

  renderFocusTrend();
  renderAchievementMeasure();
}

function renderFocusTrend() {
  const trendData = getTrendData(trendView);
  focusTrendSubtitle.textContent = trendData.subtitle;
  focusTrendDateFilter.value = formatDateInputValue(trendData.anchorDate ?? trendCursor);
  focusTrend.style.gridTemplateColumns = `repeat(${trendData.points.length}, minmax(0, 1fr))`;

  const highest = Math.max(...trendData.points.map((point) => point.percent), 1);
  focusTrend.innerHTML = trendData.points.map((point) => `
    <div class="bar">
      <strong>${point.percent}%</strong>
      <div class="bar-fill ${point.complete ? "complete" : ""}" style="height: ${Math.max(12, (point.percent / highest) * 160)}px"></div>
      <span class="bar-label">${point.label}</span>
      <span class="bar-date">${point.dateLabel ?? ""}</span>
    </div>
  `).join("");
}

function renderAchievementMeasure() {
  const filteredItems = getFilteredItems().map((entry) => entry.item);

  if (!filteredItems.length) {
    typeBreakdown.innerHTML = '<div class="empty-state">Add study items to compare achieved study time against your plan.</div>';
    return;
  }

  const totalPlannedHours = sum(filteredItems, (item) => getTimeTargetHours(item));
  const totalAchievedHours = sum(filteredItems, (item) => getDisplayedActualHours(item));
  const achievedPercent = totalPlannedHours > 0
    ? Math.min(100, Math.round((totalAchievedHours / totalPlannedHours) * 100))
    : 0;
  const remainingHours = Math.max(0, totalPlannedHours - totalAchievedHours);

  typeBreakdown.innerHTML = `
    <div class="achievement-doughnut" style="background: conic-gradient(#54c3be 0 ${achievedPercent}%, rgba(255,255,255,0.08) ${achievedPercent}% 100%)">
      <div class="achievement-doughnut-center">
        <strong>${achievedPercent}%</strong>
        <span>Achieved</span>
      </div>
    </div>
    <div class="achievement-summary">
      <div class="achievement-card">
        <span>Planned hours</span>
        <strong>${totalPlannedHours.toFixed(1)}h</strong>
      </div>
      <div class="achievement-card">
        <span>Achieved hours</span>
        <strong>${totalAchievedHours.toFixed(1)}h</strong>
      </div>
      <div class="achievement-card">
        <span>Remaining hours</span>
        <strong>${remainingHours.toFixed(1)}h | ${achievedPercent}%</strong>
      </div>
    </div>
  `;
}

function getTrendData(view) {
  const anchor = startOfDay(trendCursor);

  if (view === "day") {
    const points = [...Array(8)].map((_, index) => {
      const hourDate = new Date(anchor);
      hourDate.setMinutes(0, 0, 0);
      hourDate.setHours(index * 3);
      const nextHour = new Date(hourDate);
      nextHour.setHours(hourDate.getHours() + 3);
      const minutes = state.sessions
        .filter((session) => {
          const completedAt = new Date(session.completedAt);
          return completedAt >= hourDate && completedAt < nextHour;
        })
        .reduce((total, session) => total + session.minutes, 0);
      const percent = calculateAchievementPercent(minutes, getDailyTargetMinutesForDate(hourDate) || defaultState.timerSettings.dailyTargetMinutes);
      return {
        label: `${hourDate.toLocaleTimeString([], { hour: "numeric" })}`,
        dateLabel: hourDate.toLocaleDateString([], { month: "short", day: "numeric" }),
        minutes,
        percent,
        complete: percent >= 100
      };
    });
    return {
      subtitle: `${formatLongDate(anchor)} compared with that day's plan.`,
      anchorDate: anchor,
      points
    };
  }

  if (view === "month") {
    const points = [...Array(4)].map((_, index) => {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const weekStart = new Date(monthStart);
      weekStart.setDate(monthStart.getDate() + (index * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const minutes = state.sessions
        .filter((session) => {
          const completedAt = new Date(session.completedAt);
          return completedAt >= weekStart && completedAt < weekEnd;
        })
        .reduce((total, session) => total + session.minutes, 0);
      const plannedMinutes = getPlannedMinutesForDateRange(weekStart, addDays(weekEnd, -1));
      const percent = calculateAchievementPercent(minutes, plannedMinutes);
      return {
        label: `Week ${index + 1}`,
        dateLabel: `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} - ${addDays(weekEnd, -1).toLocaleDateString([], { month: "short", day: "numeric" })}`,
        minutes,
        percent,
        complete: percent >= 100
      };
    });
    return {
      subtitle: `${anchor.toLocaleDateString([], { month: "long", year: "numeric" })} against planned study time.`,
      anchorDate: anchor,
      points
    };
  }

  if (view === "year") {
    const points = [...Array(12)].map((_, index) => {
      const monthDate = new Date(anchor.getFullYear(), index, 1);
      const nextMonth = new Date(anchor.getFullYear(), index + 1, 1);
      const minutes = state.sessions
        .filter((session) => {
          const completedAt = new Date(session.completedAt);
          return completedAt >= monthDate && completedAt < nextMonth;
        })
        .reduce((total, session) => total + session.minutes, 0);
      const plannedMinutes = getPlannedMinutesForDateRange(monthDate, addDays(nextMonth, -1));
      const percent = calculateAchievementPercent(minutes, plannedMinutes);
      return {
        label: monthDate.toLocaleDateString([], { month: "short" }),
        dateLabel: String(monthDate.getFullYear()),
        minutes,
        percent,
        complete: percent >= 100
      };
    });
    return {
      subtitle: `${anchor.getFullYear()} against planned study time.`,
      anchorDate: anchor,
      points
    };
  }

  const points = [...Array(7)].map((_, index) => {
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() - 6);
    const date = addDays(weekStart, index);
    const label = date.toLocaleDateString([], { weekday: "short" });
    let minutes = state.sessions
      .filter((session) => isSameDay(new Date(session.completedAt), date))
      .reduce((total, session) => total + session.minutes, 0);
    if (isSameDay(date, startOfDay(new Date()))) {
      minutes += getLiveFocusMinutes();
    }
    const percent = calculateAchievementPercent(minutes, getDailyTargetMinutesForDate(date));
    return {
      label,
      dateLabel: date.toLocaleDateString([], { month: "short", day: "numeric" }),
      minutes,
      percent,
      complete: percent >= 100
    };
  });
  return {
    subtitle: `${points[0]?.dateLabel ?? ""} - ${points[points.length - 1]?.dateLabel ?? ""} against daily plan`,
    anchorDate: anchor,
    points
  };
}

function ringCompletionBell() {
  playPhoneRing();
}

function playPhoneRing() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.001, context.currentTime);
    masterGain.connect(context.destination);

    // Classic telephone-style dual-tone ring: two frequencies pulsed in bursts.
    const carriers = [440, 480].map((frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0.5, context.currentTime);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(context.currentTime);
      return oscillator;
    });

    const pulsePattern = [
      { start: 0.0, duration: 0.35, gain: 0.34 },
      { start: 0.45, duration: 0.35, gain: 0.34 },
      { start: 1.3, duration: 0.35, gain: 0.38 },
      { start: 1.75, duration: 0.35, gain: 0.38 },
      { start: 2.65, duration: 0.4, gain: 0.42 },
      { start: 3.15, duration: 0.4, gain: 0.42 }
    ];

    pulsePattern.forEach((pulse) => {
      const attack = context.currentTime + pulse.start;
      const release = attack + pulse.duration;
      masterGain.gain.cancelScheduledValues(attack);
      masterGain.gain.setValueAtTime(0.001, attack);
      masterGain.gain.exponentialRampToValueAtTime(pulse.gain, attack + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.001, release);
    });

    const stopAt = context.currentTime + 4.2;
    carriers.forEach((oscillator) => {
      oscillator.stop(stopAt);
    });

    window.setTimeout(() => {
      context.close();
    }, 4200);
  } catch (error) {
    return;
  }
}

function playBellRing() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    [0, 0.45, 0.95].forEach((start, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880 + (index * 80), context.currentTime + start);
      gain.gain.setValueAtTime(0.001, context.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.28, context.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + 0.8);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + 0.8);
    });
    window.setTimeout(() => context.close(), 2200);
  } catch (error) {
    return;
  }
}

function playChimeRing() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const notes = [659, 784, 988];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + (index * 0.22));
      gain.gain.setValueAtTime(0.001, context.currentTime + (index * 0.22));
      gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + (index * 0.22) + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (index * 0.22) + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + (index * 0.22));
      oscillator.stop(context.currentTime + (index * 0.22) + 0.45);
    });
    window.setTimeout(() => context.close(), 1400);
  } catch (error) {
    return;
  }
}

function playPopcornRing() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const pops = [0, 0.12, 0.26, 0.44, 0.68, 0.96, 1.28, 1.66];
    pops.forEach((start, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(560 + ((index % 3) * 110), context.currentTime + start);
      gain.gain.setValueAtTime(0.001, context.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + 0.08);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + 0.08);
    });
    window.setTimeout(() => context.close(), 2200);
  } catch (error) {
    return;
  }
}

function vibrateCompletionAlert() {
  if (!("vibrate" in navigator)) return;
  navigator.vibrate([250, 140, 250]);
}

function runCompletionAlert(settings = getActiveTimerSettings()) {
  const alertMode = normalizeAlertMode(settings.alertMode);
  const alertSound = normalizeAlertSound(settings.alertSound);
  if (alertMode === "off") return;
  if (alertMode === "ring" || alertMode === "both") {
    if (alertSound === "bell") {
      playBellRing();
    } else if (alertSound === "chime") {
      playChimeRing();
    } else if (alertSound === "popcorn") {
      playPopcornRing();
    } else {
      playPhoneRing();
    }
  }
  if (alertMode === "vibrate" || alertMode === "both") {
    vibrateCompletionAlert();
  }
}

function testCurrentAlert() {
  runCompletionAlert(getActiveTimerSettings());
}

function renderTimer() {
  syncTimerClock();
  timerDisplay.textContent = formatClock(timer.secondsLeft);
  updateLiveItemDisplays();
  updateTimerButtons();
  const liveDailyMinutes = getDisplayMinutesForRange("day");
  const dailyTargetMinutes = getActiveTimerSettings().dailyTargetMinutes;
  const liveDailyPercent = Math.min(100, Math.round((liveDailyMinutes / dailyTargetMinutes) * 100));
  todayProgressText.textContent = `${formatMinutesDisplay(liveDailyMinutes)} / ${dailyTargetMinutes} mins | ${liveDailyPercent}%`;
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
    const label = getStudyLabel(item);
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
  const focusLabel = selectedItem ? getStudyLabel(selectedItem) : "your selected study item";

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
    { label: "Daily target", value: `${settings.dailyTargetMinutes} mins` },
    { label: "Alert", value: settings.alertMode.charAt(0).toUpperCase() + settings.alertMode.slice(1) },
    { label: "Sound", value: settings.alertSound.charAt(0).toUpperCase() + settings.alertSound.slice(1) }
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
  timer.pausedSecondsLeft = null;
  saveTimerSession();
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
    timer.pausedSecondsLeft = null;
    timer.stageEndsAt = null;
  }
}

function getSelectedTimerItem() {
  const itemId = timerCourseSelect.value || timer.selectedItemId;
  return state.items.find((item) => item.id === itemId) ?? null;
}

function ensureTimerInterval() {
  if (!timer.running || timer.intervalId) return;

  timer.intervalId = window.setInterval(() => {
    syncTimerClock();
    if (!timer.running) return;
    renderTimer();
    renderHeroMetrics();
    renderReports();
  }, 1000);
}

function syncTimerClock() {
  if (!timer.running || !timer.stageEndsAt) return;

  const secondsRemaining = Math.max(0, Math.ceil((timer.stageEndsAt - Date.now()) / 1000));
  timer.secondsLeft = secondsRemaining;

  if (secondsRemaining <= 0) {
    completeTimerStage();
    return;
  }

  state.timerSession = {
    mode: timer.mode,
    secondsLeft: timer.secondsLeft,
    running: timer.running,
    selectedItemId: timer.selectedItemId,
    stageEndsAt: timer.stageEndsAt,
    pausedSecondsLeft: timer.pausedSecondsLeft
  };
  saveState();
}

function handleTimerVisibilityChange() {
  syncTimerClock();
  render();
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
  const settings = getActiveTimerSettings();
  const totalFocusSeconds = settings.focusMinutes * 60;
  const isRunningFocus = timer.running && timer.mode === "focus";
  const isPausedFocus = !timer.running
    && timer.mode === "focus"
    && timer.secondsLeft > 0
    && timer.secondsLeft < totalFocusSeconds;

  if (!isRunningFocus && !isPausedFocus) return 0;
  const elapsedSeconds = Math.max(0, totalFocusSeconds - timer.secondsLeft);
  return Number((elapsedSeconds / 60).toFixed(2));
}

function getLiveFocusHoursForItem(itemId) {
  const selectedItemId = timer.selectedItemId || timerCourseSelect.value;
  if (selectedItemId !== itemId) return 0;
  return Number((getLiveFocusMinutes() / 60).toFixed(2));
}

function getDisplayedActualHours(item) {
  return Number((item.actualHours + getLiveFocusHoursForItem(item.id)).toFixed(2));
}

function getTimeTargetHours(item) {
  if ((item.plannedHours || 0) > 0) {
    return item.plannedHours;
  }
  return (normalizePomodoroSettings(item.pomodoro).focusMinutes || 0) / 60;
}

function formatMinutesDisplay(value) {
  const rounded = Number(value || 0);
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(1);
}

function getDisplayedTimeProgress(item) {
  const displayedHours = getDisplayedActualHours(item);
  const targetHours = getTimeTargetHours(item);
  const autoProgress = targetHours > 0
    ? Math.round(Math.min(100, (displayedHours / targetHours) * 100))
    : 0;
  return Math.max(item.progress || 0, autoProgress);
}

function isStudyGoalAchieved(item) {
  const timeDone = getTimeTargetHours(item) <= 0 ? true : getDisplayedTimeProgress(item) >= 100;
  const contentState = getContentProgressState(item);
  const contentTargetExists = getContentTrackingConfig(item).total > 0;
  const contentDone = contentTargetExists ? contentState.percent >= 100 : true;
  return timeDone && contentDone;
}

function updateLiveItemDisplays() {
  document.querySelectorAll(".item-card").forEach((card) => {
    const itemId = card.dataset.itemId;
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const progressRange = card.querySelector(".progress-range");
    const progressValue = card.querySelector(".progress-value");
    const displayedProgress = getDisplayedTimeProgress(item);
    if (progressRange) {
      progressRange.value = displayedProgress;
    }
    if (progressValue) {
      progressValue.textContent = `${displayedProgress}% time achieved`;
    }
    const goalStatus = card.querySelector(".goal-status");
    if (goalStatus) {
      const achieved = isStudyGoalAchieved(item);
      goalStatus.textContent = achieved ? "Study goal achieved" : "Study goal in progress";
      goalStatus.classList.toggle("complete", achieved);
      goalStatus.classList.toggle("pending", !achieved);
    }
  });
}

function updateTimerButtons() {
  const hasPausedSession = Boolean(timer.pausedSecondsLeft && timer.pausedSecondsLeft > 0);
  startTimerButton.hidden = false;
  resetTimerButton.hidden = false;

  startTimerButton.disabled = false;
  resetTimerButton.disabled = false;
  startTimerButton.textContent = timer.running ? "Pause" : (hasPausedSession ? "Continue" : "Start");
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
  if (activeView !== "all") {
    viewCursor = startOfDay(new Date());
  }
  render();
}

function shiftTimelineWindow(direction) {
  if (activeView === "all") return;

  if (activeView === "month") {
    viewCursor = addMonths(viewCursor, direction);
  } else if (activeView === "year") {
    viewCursor = addYears(viewCursor, direction);
  } else {
    viewCursor = addDays(viewCursor, direction);
  }

  render();
}

function handleTrendFilterChange(event) {
  const button = event.target.closest("[data-trend-view]");
  if (!button) return;
  trendView = button.dataset.trendView;
  renderReports();
}

function handleFocusTrendDateFilterChange() {
  if (!focusTrendDateFilter.value) return;
  trendCursor = startOfDay(new Date(`${focusTrendDateFilter.value}T00:00:00`));
  renderReports();
}

function handleUpcomingDateFilterChange() {
  if (!upcomingDateFilter.value) return;
  activeView = "today";
  viewCursor = startOfDay(new Date(`${upcomingDateFilter.value}T00:00:00`));
  render();
}

function getFilteredItems() {
  const windowRange = getActiveViewRange();

  return state.items
    .map((item) => {
      const occurrenceDate = getOccurrenceForView(item, activeView, windowRange);
      return occurrenceDate ? { item, occurrenceDate } : null;
    })
    .filter(Boolean);
}

function getViewDetails(view) {
  const windowRange = getActiveViewRange();
  if (view === "today") {
    return {
      eyebrow: isSameDay(windowRange.start, startOfDay(new Date())) ? "Today" : windowRange.start.toLocaleDateString([], { weekday: "long" }),
      title: formatLongDate(windowRange.start),
      subtitle: `Viewing items due on ${formatLongDate(windowRange.start)}.`,
      listTitle: `Tasks for ${windowRange.start.toLocaleDateString([], { month: "short", day: "numeric" })}`,
      listSubtitle: "Update your time progress automatically and pages or units whenever you want."
    };
  }
  if (view === "tomorrow") {
    return {
      eyebrow: isSameDay(windowRange.start, addDays(startOfDay(new Date()), 1)) ? "Tomorrow" : windowRange.start.toLocaleDateString([], { weekday: "long" }),
      title: formatLongDate(windowRange.start),
      subtitle: `Viewing items due on ${formatLongDate(windowRange.start)}.`,
      listTitle: `Tasks for ${windowRange.start.toLocaleDateString([], { month: "short", day: "numeric" })}`,
      listSubtitle: "Update your time progress automatically and pages or units whenever you want."
    };
  }
  if (view === "month") {
    return {
      eyebrow: "Month",
      title: windowRange.start.toLocaleDateString([], { month: "long", year: "numeric" }),
      subtitle: `Viewing items due from ${windowRange.start.toLocaleDateString([], { month: "short", day: "numeric" })} to ${windowRange.end.toLocaleDateString([], { month: "short", day: "numeric" })}.`,
      listTitle: `Upcoming work for ${windowRange.start.toLocaleDateString([], { month: "long" })}`,
      listSubtitle: "Update your time progress automatically and pages or units whenever you want."
    };
  }
  if (view === "year") {
    return {
      eyebrow: "Year",
      title: String(windowRange.start.getFullYear()),
      subtitle: `Viewing items due from ${windowRange.start.toLocaleDateString([], { month: "short", day: "numeric" })} to ${windowRange.end.toLocaleDateString([], { month: "short", day: "numeric" })}.`,
      listTitle: `Upcoming work in ${windowRange.start.getFullYear()}`,
      listSubtitle: "Update your time progress automatically and pages or units whenever you want."
    };
  }
  return {
    eyebrow: "All",
    title: "All Plans",
    subtitle: "Viewing every saved item.",
    listTitle: "All upcoming work",
    listSubtitle: "Showing every saved study goal."
  };
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDateInputValue(date) {
  return startOfDay(date).toLocaleDateString("en-CA");
}

function addDays(date, amount) {
  const value = startOfDay(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function addMonths(date, amount) {
  const value = startOfDay(date);
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function addYears(date, amount) {
  const value = startOfDay(date);
  return new Date(value.getFullYear() + amount, 0, 1);
}

function calculateAchievementPercent(actualMinutes, plannedMinutes) {
  if (!plannedMinutes || plannedMinutes <= 0) return 0;
  return Math.min(100, Math.round((actualMinutes / plannedMinutes) * 100));
}

function getDailyTargetMinutesForDate(date) {
  const activeItems = getItemsScheduledForDate(date);
  const total = activeItems.reduce(
    (sumMinutes, item) => sumMinutes + normalizePomodoroSettings(item.pomodoro).dailyTargetMinutes,
    0
  );
  return total || getActiveTimerSettings().dailyTargetMinutes;
}

function getPlannedMinutesForDateRange(startDate, endDate) {
  let total = 0;
  let cursor = startOfDay(startDate);
  const safeEnd = startOfDay(endDate);

  while (cursor <= safeEnd) {
    total += getDailyTargetMinutesForDate(cursor);
    cursor = addDays(cursor, 1);
  }

  return total;
}

function getItemsScheduledForDate(date) {
  const targetDate = startOfDay(date);
  return state.items.filter((item) => {
    const dueDate = startOfDay(new Date(`${item.dueDate}T00:00:00`));
    const repeat = normalizeRepeat(item.repeat);
    if (!repeat) {
      return isSameDay(dueDate, targetDate);
    }
    return matchesRecurringDate(dueDate, targetDate, repeat);
  });
}

function getActiveViewRange() {
  const anchor = startOfDay(viewCursor);

  if (activeView === "today") {
    return {
      start: anchor,
      end: anchor,
      isSingleDay: true
    };
  }

  if (activeView === "tomorrow") {
    const target = addDays(anchor, 1);
    return {
      start: target,
      end: target,
      isSingleDay: true
    };
  }

  if (activeView === "month") {
    return {
      start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0),
      isSingleDay: false
    };
  }

  if (activeView === "year") {
    return {
      start: new Date(anchor.getFullYear(), 0, 1),
      end: new Date(anchor.getFullYear(), 11, 31),
      isSingleDay: false
    };
  }

  return {
    start: anchor,
    end: anchor,
    isSingleDay: false
  };
}

function getOccurrenceForView(item, view, windowRange) {
  const dueDate = startOfDay(new Date(`${item.dueDate}T00:00:00`));
  const repeat = normalizeRepeat(item.repeat);

  if (!repeat) {
    if (view === "all") return dueDate;
    return dueDate >= windowRange.start && dueDate <= windowRange.end ? dueDate : null;
  }

  if (view === "all") {
    return getNextOccurrenceOnOrAfter(dueDate, viewCursor, repeat) ?? dueDate;
  }
  if (windowRange.isSingleDay) {
    return matchesRecurringDate(dueDate, windowRange.start, repeat) ? windowRange.start : null;
  }
  return findFirstRecurringInRange(dueDate, windowRange.start, windowRange.end, repeat);
}

function buildRepeatConfig(data) {
  const preset = data.get("repeatPreset");
  return repeatConfigFromPreset(preset);
}

function repeatConfigFromPreset(preset) {
  if (preset === "daily") return { interval: 1, unit: "day" };
  if (preset === "weekly") return { interval: 1, unit: "week" };
  if (preset === "monthly") return { interval: 1, unit: "month" };
  if (preset === "yearly") return { interval: 1, unit: "year" };
  return null;
}

function getRepeatPresetValue(repeat) {
  const normalized = normalizeRepeat(repeat);
  if (!normalized) return "none";
  if (normalized.interval === 1 && normalized.unit === "day") return "daily";
  if (normalized.interval === 1 && normalized.unit === "week") return "weekly";
  if (normalized.interval === 1 && normalized.unit === "month") return "monthly";
  if (normalized.interval === 1 && normalized.unit === "year") return "yearly";
  return "none";
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
  const updatedItem = {
    ...item,
    actualHours
  };
  const progress = getDisplayedTimeProgress(updatedItem);
  const completed = isStudyGoalAchieved({
    ...updatedItem,
    progress
  });

  return {
    ...updatedItem,
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

function getStudyLabel(item) {
  if (item.title) {
    return `${item.course} - ${item.title}`;
  }
  return item.course;
}

function getCurrentUser() {
  return authState?.currentUser || "";
}

function getPlannerStorageKey() {
  const user = getCurrentUser().trim().toLowerCase();
  return user ? `${STORAGE_KEY}-${user}` : STORAGE_KEY;
}

function registerServiceWorker() {
  const canRegister = "serviceWorker" in navigator
    && (window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  if (!canRegister) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      return null;
    });
  });
}

function focusMainApp() {
  appShell.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createSupabaseClient() {
  const url = String(supabaseConfig.url || "").trim();
  const anonKey = String(supabaseConfig.anonKey || "").trim();
  const supabaseFactory = window.supabase?.createClient;

  if (!url || !anonKey || typeof supabaseFactory !== "function") {
    return null;
  }

  return supabaseFactory(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

function getPasswordResetRedirect() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.href;
  }

  return "";
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

