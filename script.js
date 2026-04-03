import {
  DAYS,
  FULL_START_MINUTES,
  FULL_END_MINUTES,
  COOKIE_STATE,
  MODULES_API_PATH,
  MODULES_FALLBACK_PATH,
  MODULE_COLOR_PALETTE,
} from "./frontend/js/constants.js";
import {
  toMinutes,
  fromMinutes,
  getAcademicWeekStart,
  getAcademicWeekOffset,
  clampAcademicWeekOffset,
  dayLabel,
} from "./frontend/js/time.js";
import {
  encodeState,
  decodeState,
} from "./frontend/js/storage.js";
import {
  sanitizeModuleCatalog,
} from "./frontend/js/catalogHelpers.js";
import {
  filterByWeekPattern,
  assignLanes,
  getVisibleTimeBounds,
  getAdaptiveVerticalBounds,
  toRenderableEvents,
} from "./frontend/js/timetableCore.js";
import {
  buildGrid,
  renderEvents,
} from "./frontend/js/timetableRender.js";
import {
  buildShareLink,
  saveState,
  restoreInitialState,
} from "./frontend/js/statePersistence.js";
import {
  setEmptyState,
  clearEmptyState,
  lessonTimeLabel,
  renderSummary,
  renderDateStrip,
  renderLegend,
  renderModuleSuggestions,
} from "./frontend/js/uiRender.js";
import {
  bindEvents,
} from "./frontend/js/bindEvents.js";

let moduleCatalog = [];

const timetable = document.getElementById("timetable");
const timetableWrap = timetable ? timetable.closest(".timetable-wrap") : null;
const timetableEmpty = document.getElementById("timetableEmpty");
const moduleLegend = document.getElementById("moduleLegend");
const moduleSummary = document.getElementById("moduleSummary");
const weekMetaBadge = document.getElementById("weekMetaBadge");
const weekPatternNote = document.getElementById("weekPatternNote");
const feedback = document.getElementById("feedback");
const hideFeedbackBtn = document.getElementById("hideFeedbackBtn");
const toggleThemeBtn = document.getElementById("toggleTheme");
const toggleOrientationBtn = document.getElementById("toggleOrientation");
const toggleSquishBtn = document.getElementById("toggleSquish");
const shareLinkBtn = document.getElementById("shareLinkBtn");
const printBtn = document.getElementById("printBtn");
const exportIcsBtn = document.getElementById("exportIcsBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const moduleSearch = document.getElementById("moduleSearch");
const searchResults = document.getElementById("searchResults");
const dateStrip = document.getElementById("dateStrip");
const prevWeekBtn = document.getElementById("datePrevBtn");
const nextWeekBtn = document.getElementById("dateNextBtn");
const todayBtn = document.getElementById("todayBtn");

const defaultState = {
  theme: "light",
  orientation: "horizontal",
  squishTime: false,
  forceFullRange: false,
  weekPattern: "all",
  selectedCodes: ["CS2030S", "MA2001", "IS1108", "GEA1000", "CFG1002"],
  hiddenCodes: [],
  customColors: {},
  search: "",
  weekOffset: getAcademicWeekOffset(new Date()),
};

let state = { ...defaultState };
let openColorMenuCode = "";
let openTgSourceCode = "";

function applyTheme()
{
  const darkMode = state.theme === "dark";
  document.body.classList.toggle("theme-dark", darkMode);
  if (toggleThemeBtn)
  {
    toggleThemeBtn.textContent = darkMode ? "Light Mode" : "Dark Mode";
  }
}

function moduleRootCode(code)
{
  return String(code || "").toUpperCase().replace(/-TG\d+$/i, "");
}

function tgAlternativesFor(code)
{
  const root = moduleRootCode(code);
  return moduleCatalog.filter((mod) => moduleRootCode(mod.code) === root && mod.code !== code);
}

function moduleNameFromCode(code)
{
  const root = moduleRootCode(code);
  const match = moduleCatalog.find((mod) => moduleRootCode(mod.code) === root);
  return match ? String(match.name || root) : root;
}

function defaultTgCodeForRoot(rootCode)
{
  const candidates = moduleCatalog
    .filter((mod) => moduleRootCode(mod.code) === rootCode)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { sensitivity: "base" }));
  return candidates.length > 0 ? candidates[0].code : "";
}

function resolveModuleSelectionInput(input)
{
  const normalized = String(input || "").trim().toUpperCase();
  if (!normalized)
  {
    return "";
  }

  const exactCode = findModuleByCode(normalized);
  if (exactCode)
  {
    return exactCode.code;
  }

  const rootCode = moduleRootCode(normalized);
  return defaultTgCodeForRoot(rootCode);
}

function applyCatalog(moduleList)
{
  const rootColorMap = new Map();
  moduleCatalog = moduleList.map((mod) => {
    const root = moduleRootCode(mod.code);
    if (!rootColorMap.has(root))
    {
      rootColorMap.set(root, mod.color);
    }

    return {
      ...mod,
      name: String(mod.name || root),
      color: rootColorMap.get(root),
    };
  });

  const availableCodes = new Set(moduleCatalog.map((mod) => mod.code));
  const availableRoots = new Set(moduleCatalog.map((mod) => moduleRootCode(mod.code)));

  defaultState.selectedCodes = [...availableRoots]
    .slice(0, 5)
    .map((root) => defaultTgCodeForRoot(root))
    .filter(Boolean);

  state.selectedCodes = state.selectedCodes.filter((code) => availableCodes.has(code));
  const seenRoots = new Set();
  state.selectedCodes = state.selectedCodes.filter((code) => {
    const root = moduleRootCode(code);
    if (seenRoots.has(root))
    {
      return false;
    }
    seenRoots.add(root);
    return true;
  });
  state.hiddenCodes = state.hiddenCodes.filter((code) => state.selectedCodes.includes(code));
  const selectedRoots = new Set(state.selectedCodes.map((code) => moduleRootCode(code)));
  state.customColors = Object.fromEntries(
    Object.entries(state.customColors)
      .map(([code, color]) => [moduleRootCode(code), color])
      .filter(([code]) => selectedRoots.has(code))
  );

  if (state.selectedCodes.length === 0)
  {
    state.selectedCodes = [...defaultState.selectedCodes];
  }
}

async function loadCatalogFromBackend()
{
  const fetchCatalog = async (path) => {
    const response = await fetch(path, { method: "GET", cache: "no-store" });
    if (!response.ok)
    {
      return [];
    }

    const payload = await response.json();
    return sanitizeModuleCatalog(payload.modules || payload);
  };

  try
  {
    let catalog = await fetchCatalog(MODULES_API_PATH);
    if (catalog.length === 0)
    {
      catalog = await fetchCatalog(MODULES_FALLBACK_PATH);
    }

    if (catalog.length > 0)
    {
      applyCatalog(catalog);
    }
  }
  catch {
    // Keep empty catalog if fetch fails; UI will show empty-state guidance.
  }
}

function findModuleByCode(code)
{
  const normalized = String(code || "").trim().toUpperCase();
  return moduleCatalog.find((mod) => mod.code === normalized) || null;
}

function selectedModules() {
  const selectedSet = new Set(state.selectedCodes);
  return moduleCatalog.filter((mod) => selectedSet.has(mod.code));
}

function visibleSelectedModules() {
  const hiddenSet = new Set(state.hiddenCodes);
  return selectedModules().filter((mod) => !hiddenSet.has(mod.code));
}

function getModuleColor(code, fallback) {
  const root = moduleRootCode(code);
  return state.customColors[root] || fallback;
}

function setModuleColor(code, color) {
  if (!MODULE_COLOR_PALETTE.includes(color)) {
    return;
  }
  const root = moduleRootCode(code);
  state.customColors[root] = color;
  openColorMenuCode = "";
  setFeedback(`Updated ${root} color.`);
  render();
}

function weekDates() {
  const start = getAcademicWeekStart(new Date(), state.weekOffset);
  return DAYS.map((_, idx) => {
    const date = new Date(start);
    date.setDate(start.getDate() + idx);
    return date;
  });
}

function currentWeekNumber() {
  return clampAcademicWeekOffset(state.weekOffset);
}

function lessonsForCurrentWeek() {
  const weekNum = currentWeekNumber();
  return visibleSelectedModules().flatMap((mod) =>
    mod.lessons
      .filter((lesson) => filterByWeekPattern(lesson, state.weekPattern, weekNum))
      .map((lesson) => ({
        ...lesson,
        code: mod.code,
        color: getModuleColor(mod.code, mod.color),
        isTgOption: false,
        isTgActive: openTgSourceCode === mod.code,
      }))
  );
}

function tgOptionLessonsForCurrentWeek() {
  if (!openTgSourceCode || !state.selectedCodes.includes(openTgSourceCode)) {
    return [];
  }

  const weekNum = currentWeekNumber();
  const selectedSet = new Set(state.selectedCodes);
  return tgAlternativesFor(openTgSourceCode)
    .filter((mod) => !selectedSet.has(mod.code))
    .flatMap((mod) =>
      mod.lessons
        .filter((lesson) => filterByWeekPattern(lesson, state.weekPattern, weekNum))
        .map((lesson) => ({
          ...lesson,
          code: mod.code,
          color: getModuleColor(mod.code, mod.color),
          isTgOption: true,
          isTgActive: false,
        }))
    );
}

function chooseTgOption(nextCode)
{
  if (!openTgSourceCode || !state.selectedCodes.includes(openTgSourceCode))
  {
    openTgSourceCode = "";
    render();
    return;
  }

  const selectedIndex = state.selectedCodes.indexOf(openTgSourceCode);
  if (selectedIndex === -1)
  {
    openTgSourceCode = "";
    render();
    return;
  }

  state.selectedCodes[selectedIndex] = nextCode;

  if (state.hiddenCodes.includes(openTgSourceCode))
  {
    state.hiddenCodes = state.hiddenCodes.map((code) => (code === openTgSourceCode ? nextCode : code));
  }

  openTgSourceCode = "";
  setFeedback(`Selected ${moduleRootCode(nextCode)} TG option.`);
  render();
}

function handleEventClick(eventData)
{
  if (eventData.isTgOption)
  {
    chooseTgOption(eventData.code);
    return;
  }

  if (!state.selectedCodes.includes(eventData.code))
  {
    return;
  }

  const availableAlternatives = tgAlternativesFor(eventData.code).filter((mod) => !state.selectedCodes.includes(mod.code));
  if (availableAlternatives.length === 0)
  {
    setFeedback(`No other TGs available for ${moduleRootCode(eventData.code)}.`);
    return;
  }

  if (openTgSourceCode === eventData.code)
  {
    openTgSourceCode = "";
    setFeedback(`Closed TG choices for ${moduleRootCode(eventData.code)}.`);
    render();
    return;
  }

  openTgSourceCode = eventData.code;
  setFeedback(`Pick a TG option for ${moduleRootCode(eventData.code)}.`);
  render();
}


function setFeedback(message, dismissible = false) {
  feedback.textContent = message;
  if (hideFeedbackBtn) {
    hideFeedbackBtn.hidden = !dismissible || !message;
  }
}

function clearFeedback() {
  setFeedback("", false);
}

function addModule(code) {
  if (!code)
  {
    return;
  }

  const moduleMatch = findModuleByCode(code);
  if (!moduleMatch)
  {
    const normalized = String(code).trim().toUpperCase();
    setFeedback(`Module ${normalized} is not in this placeholder catalog.`);
    return;
  }

  const root = moduleRootCode(moduleMatch.code);
  if (state.selectedCodes.some((selectedCode) => moduleRootCode(selectedCode) === root))
  {
    setFeedback(`Module ${root} already selected.`);
    return;
  }

  state.selectedCodes.push(moduleMatch.code);
  setFeedback(`Added ${root}.`);
  render();
}

function removeModule(code) {
  const root = moduleRootCode(code);
  state.selectedCodes = state.selectedCodes.filter((value) => value !== code);
  state.hiddenCodes = state.hiddenCodes.filter((value) => value !== code);
  delete state.customColors[root];
  if (openColorMenuCode === code) {
    openColorMenuCode = "";
  }
  if (openTgSourceCode === code) {
    openTgSourceCode = "";
  }
  setFeedback(`Removed ${root}.`);
  render();
}

function clearAllModules() {
  state.selectedCodes = [];
  state.hiddenCodes = [];
  state.customColors = {};
  openColorMenuCode = "";
  openTgSourceCode = "";
  setFeedback("Cleared all selected modules.");
  render();
}

function toggleModuleVisibility(code) {
  if (!state.selectedCodes.includes(code)) {
    return;
  }

  if (state.hiddenCodes.includes(code)) {
    state.hiddenCodes = state.hiddenCodes.filter((value) => value !== code);
    setFeedback(`Showing ${code}.`);
  } else {
    state.hiddenCodes = [...state.hiddenCodes, code];
    if (openTgSourceCode === code) {
      openTgSourceCode = "";
    }
    setFeedback(`Hiding ${code}.`);
  }
  render();
}

function addModuleFromSearchInput() {
  if (!moduleSearch)
  {
    return;
  }

  const normalized = moduleSearch.value.trim().toUpperCase();
  if (!normalized)
  {
    return;
  }

  const resolvedCode = resolveModuleSelectionInput(normalized);
  if (!resolvedCode)
  {
    setFeedback(`Module ${normalized} is not in this placeholder catalog.`);
    return;
  }

  addModule(resolvedCode);
  moduleSearch.value = "";
  state.search = "";
  drawSuggestions();
}

function drawSuggestions()
{
  const isSearchFocused = moduleSearch ? document.activeElement === moduleSearch : false;

  renderModuleSuggestions({
    searchResults,
    moduleSearch,
    moduleCatalog,
    query: state.search,
    selectedCodes: state.selectedCodes,
    isSearchFocused,
    onAddFromSuggestion: addModuleFromSearchInput,
  });
}

function formatIcsDate(date, hhmm) {
  const hours = Number(hhmm.slice(0, 2));
  const mins = Number(hhmm.slice(2));
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, mins, 0);
  const yyyy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  const hh = String(local.getHours()).padStart(2, "0");
  const min = String(local.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${min}00`;
}

function exportIcs() {
  const lessons = lessonsForCurrentWeek();
  if (lessons.length === 0) {
    setFeedback("No lessons available to export.");
    return;
  }

  const dates = weekDates();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Placeholder Timetable//EN",
    "CALSCALE:GREGORIAN",
  ];

  lessons.forEach((lesson, idx) => {
    const date = dates[DAYS.indexOf(lesson.day)];
    if (!date) {
      return;
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${lesson.code}-${idx}-${Date.now()}@placeholder.local`);
    lines.push(`DTSTAMP:${formatIcsDate(new Date(), "0000")}`);
    lines.push(`DTSTART:${formatIcsDate(date, lesson.start)}`);
    lines.push(`DTEND:${formatIcsDate(date, lesson.end)}`);
    lines.push(`SUMMARY:${lesson.code}`);
    lines.push(`LOCATION:${lesson.venue}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "timetable.ics";
  link.click();
  URL.revokeObjectURL(url);
  setFeedback("Exported ICS file.");
}

function render() {
  state.weekOffset = clampAcademicWeekOffset(state.weekOffset);

  if (openTgSourceCode && !state.selectedCodes.includes(openTgSourceCode)) {
    openTgSourceCode = "";
  }

  const weekLessons = lessonsForCurrentWeek();
  const tgOptionLessons = tgOptionLessonsForCurrentWeek();
  const lessonsToRender = [...weekLessons, ...tgOptionLessons];

  let bounds = getVisibleTimeBounds(lessonsToRender, state.squishTime);
  if (state.orientation === "vertical" && !state.squishTime && !state.forceFullRange)
  {
    const timetableWrap = timetable.parentElement;
    const containerWidth = timetableWrap ? timetableWrap.clientWidth : timetable.clientWidth;
    bounds = getAdaptiveVerticalBounds(lessonsToRender, containerWidth);
  }

  let events = toRenderableEvents(lessonsToRender, bounds);

  if (state.squishTime && lessonsToRender.length > 0 && events.length === 0) {
    bounds = { startMinutes: FULL_START_MINUTES, endMinutes: FULL_END_MINUTES };
    events = toRenderableEvents(lessonsToRender, bounds);
    setFeedback("No classes in squished range. Showing full range instead.");
  }

  const maxLaneCount = events.reduce((max, eventData) => Math.max(max, Number(eventData.laneCount) || 1), 1);
  const dayColMin = Math.max(92, Math.min(210, 96 + (maxLaneCount - 1) * 34));
  timetable.style.setProperty("--day-col-min", `${dayColMin}px`);

  buildGrid(timetable, bounds, state.orientation);
  renderEvents(
    timetable,
    events,
    bounds,
    state.orientation,
    (eventData) => lessonTimeLabel(fromMinutes, eventData),
    handleEventClick
  );
  renderLegend({
    moduleLegend,
    modules: selectedModules(),
    hiddenCodes: state.hiddenCodes,
    openColorMenuCode,
    getModuleColor,
    moduleColorPalette: MODULE_COLOR_PALETTE,
    onTogglePalette: (code, isOpen) => {
      openColorMenuCode = isOpen ? "" : code;
      render();
    },
    onSetColor: setModuleColor,
    onToggleVisibility: toggleModuleVisibility,
    onRemove: removeModule,
  });
  renderSummary({
    moduleSummary,
    weekMetaBadge,
    weekPatternNote,
    selectedCount: state.selectedCodes.length,
    hiddenCount: state.hiddenCodes.length,
    lessonsCount: weekLessons.length,
    weekNumber: currentWeekNumber(),
    weekPattern: state.weekPattern,
  });
  drawSuggestions();
  renderDateStrip({
    dateStrip,
    dates: weekDates(),
    days: DAYS,
    weekNumber: currentWeekNumber(),
    dayLabel,
  });

  toggleOrientationBtn.textContent = state.orientation === "horizontal" ? "Vertical Calendar" : "Horizontal Calendar";
  toggleSquishBtn.textContent = state.squishTime ? "Full Time Range" : "Squish Time";
  applyTheme();
  timetable.dataset.orientation = state.orientation;
  timetable.dataset.squish = String(state.squishTime);

  clearEmptyState(timetableEmpty);
  if (state.selectedCodes.length === 0) {
    setEmptyState(timetableEmpty, "No modules selected. Use search to start.");
  } else if (weekLessons.length === 0) {
    setEmptyState(timetableEmpty, "No lessons match the current week pattern.");
  } else if (events.length === 0) {
    setEmptyState(timetableEmpty, "No lessons can be displayed in the current time range.");
  }

  saveState(state);
}

bindEvents({
  elements: {
    toggleThemeBtn,
    toggleOrientationBtn,
    toggleSquishBtn,
    moduleSearch,
    searchResults,
    clearAllBtn,
    prevWeekBtn,
    nextWeekBtn,
    todayBtn,
    shareLinkBtn,
    hideFeedbackBtn,
    printBtn,
    exportIcsBtn,
    timetableWrap,
  },
  getState: () => state,
  render,
  drawSuggestions,
  addModuleFromSearchInput,
  clearAllModules,
  setFeedback,
  buildShareLink,
  exportIcs,
  clearFeedback,
});

async function initializeApp()
{
  await loadCatalogFromBackend();
  state = restoreInitialState(state, moduleCatalog, defaultState, setFeedback);
  render();
}

initializeApp();

window.__timetableTestHooks = {
  assignLanes,
  filterByWeekPattern,
  encodeState,
  decodeState,
};
