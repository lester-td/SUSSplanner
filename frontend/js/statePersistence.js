import {
  COOKIE_STATE,
  WEEK_PATTERN_OPTIONS,
  MODULE_COLOR_PALETTE,
} from "./constants.js";
import {
  encodeState,
  decodeState,
  setCookie,
  getCookie,
} from "./storage.js";

function moduleRootCode(code)
{
  return String(code || "").toUpperCase().replace(/-TG\d+$/i, "");
}

export function getStatePayload(state)
{
  return {
    theme: state.theme,
    orientation: state.orientation,
    squishTime: state.squishTime,
    weekPattern: state.weekPattern,
    selectedCodes: state.selectedCodes,
    hiddenCodes: state.hiddenCodes,
    customColors: state.customColors,
    weekOffset: state.weekOffset,
  };
}

export function sanitizeState(candidate, moduleCatalog, defaultState)
{
  const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
  const catalogSet = new Set(moduleCatalog.map((mod) => mod.code));
  const paletteSet = new Set(MODULE_COLOR_PALETTE);

  const selectedRaw = Array.isArray(safeCandidate.selectedCodes)
    ? [...new Set(safeCandidate.selectedCodes.map((code) => String(code).toUpperCase()).filter((code) => catalogSet.has(code)))]
    : defaultState.selectedCodes;

  const selected = [];
  const seenRoots = new Set();
  selectedRaw.forEach((code) => {
    const root = moduleRootCode(code);
    if (seenRoots.has(root))
    {
      return;
    }
    seenRoots.add(root);
    selected.push(code);
  });
  const selectedRoots = new Set(selected.map((code) => moduleRootCode(code)));

  const hidden = Array.isArray(safeCandidate.hiddenCodes)
    ? [...new Set(safeCandidate.hiddenCodes.map((code) => String(code).toUpperCase()).filter((code) => selected.includes(code)))]
    : [];

  const safeColors = safeCandidate.customColors && typeof safeCandidate.customColors === "object"
    ? Object.fromEntries(
        Object.entries(safeCandidate.customColors)
          .map(([code, color]) => [moduleRootCode(code), String(color).toLowerCase()])
          .filter(([code, color]) => selectedRoots.has(code) && paletteSet.has(color))
      )
    : {};

  return {
    theme: safeCandidate.theme === "dark" ? "dark" : "light",
    orientation: safeCandidate.orientation === "vertical" ? "vertical" : "horizontal",
    squishTime: Boolean(safeCandidate.squishTime),
    weekPattern: WEEK_PATTERN_OPTIONS.includes(safeCandidate.weekPattern) ? safeCandidate.weekPattern : "all",
    selectedCodes: selected,
    hiddenCodes: hidden,
    customColors: safeColors,
    search: "",
    weekOffset: Number.isFinite(Number(safeCandidate.weekOffset)) ? Number(safeCandidate.weekOffset) : 0,
  };
}

export function buildShareLink(state)
{
  const encoded = encodeState(getStatePayload(state));
  return `${window.location.origin}${window.location.pathname}?s=${encoded}`;
}

export function saveState(state)
{
  const encoded = encodeState(getStatePayload(state));
  setCookie(COOKIE_STATE, encoded, 120);
}

export function restoreInitialState(state, moduleCatalog, defaultState, setFeedback)
{
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("s");
  const fromCookie = getCookie(COOKIE_STATE);

  try
  {
    if (fromUrl)
    {
      setFeedback("Loaded timetable from share link.");
      return { ...state, ...sanitizeState(decodeState(fromUrl), moduleCatalog, defaultState) };
    }

    if (fromCookie)
    {
      return { ...state, ...sanitizeState(decodeState(fromCookie), moduleCatalog, defaultState) };
    }
  }
  catch {
    setFeedback("Saved state could not be loaded. Using defaults.");
  }

  return state;
}
