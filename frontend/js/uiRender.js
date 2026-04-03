export function setEmptyState(timetableEmpty, message)
{
  timetableEmpty.hidden = false;
  timetableEmpty.textContent = message;
}

export function clearEmptyState(timetableEmpty)
{
  timetableEmpty.hidden = true;
  timetableEmpty.textContent = "";
}

export function lessonTimeLabel(fromMinutes, eventData)
{
  return `${fromMinutes(eventData.originalStart || eventData.start)}-${fromMinutes(eventData.originalEnd || eventData.end)}`;
}

export function updateWeekModeButtons(weekModeButtons, weekPattern)
{
  weekModeButtons.forEach((button) => {
    const active = button.dataset.weekMode === weekPattern;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function renderSummary({
  moduleSummary,
  weekMetaBadge,
  weekPatternNote,
  selectedCount,
  hiddenCount,
  lessonsCount,
  weekNumber,
  weekPattern,
})
{
  const visibleModuleCount = selectedCount - hiddenCount;
  const weekParity = weekNumber % 2 === 1 ? "Odd" : "Even";

  moduleSummary.textContent = `Selected modules: ${selectedCount} | Visible modules: ${visibleModuleCount} | Visible lessons: ${lessonsCount}`;
  if (weekMetaBadge)
  {
    weekMetaBadge.textContent = `Week ${weekNumber} (${weekParity})`;
  }
  weekPatternNote.textContent = `Filter: ${weekPattern.toUpperCase()}`;
}

export function renderDateStrip({
  dateStrip,
  dates,
  days,
  weekNumber,
  dayLabel,
})
{
  dateStrip.innerHTML = "";

  dates.forEach((date, idx) => {
    const pill = document.createElement("div");
    pill.className = "date-pill";
    pill.setAttribute("aria-label", `${days[idx]} ${dayLabel(date)}`);

    const dayText = document.createElement("span");
    dayText.className = "date-pill-day";
    dayText.textContent = `W${weekNumber} ${days[idx]}`;

    const dateText = document.createElement("span");
    dateText.className = "date-pill-date";
    dateText.textContent = dayLabel(date);

    pill.appendChild(dayText);
    pill.appendChild(dateText);

    dateStrip.appendChild(pill);
  });
}

export function renderLegend({
  moduleLegend,
  modules,
  hiddenCodes,
  openColorMenuCode,
  getModuleColor,
  moduleColorPalette,
  onTogglePalette,
  onSetColor,
  onToggleVisibility,
  onRemove,
})
{
  moduleLegend.innerHTML = "";
  const moduleRootCode = (code) => String(code || "").toUpperCase().replace(/-TG\d+$/i, "");

  modules.forEach((mod) => {
    const displayCode = String(mod.rootCode || moduleRootCode(mod.code));
    const hidden = hiddenCodes.includes(mod.code);
    const paletteOpen = openColorMenuCode === mod.code;
    const currentColor = getModuleColor(mod.code, mod.color);
    const li = document.createElement("li");
    li.className = `legend-item ${hidden ? "hidden" : ""} ${paletteOpen ? "palette-open" : ""}`;

    const swatch = document.createElement("button");
    swatch.className = `legend-swatch ${hidden ? "hidden" : ""}`;
    swatch.type = "button";
    swatch.style.backgroundColor = hidden ? `${currentColor}55` : currentColor;
    swatch.title = `Choose color for ${displayCode}`;
    swatch.setAttribute("aria-label", `Choose color for ${displayCode}`);
    swatch.setAttribute("aria-expanded", String(paletteOpen));
    swatch.addEventListener("click", () => onTogglePalette(mod.code, paletteOpen));

    const toggleVisibility = document.createElement("button");
    toggleVisibility.className = `legend-toggle ${hidden ? "is-hidden" : ""}`;
    toggleVisibility.type = "button";
    toggleVisibility.title = `${hidden ? "Show" : "Hide"} ${displayCode}`;
    toggleVisibility.setAttribute("aria-label", `${hidden ? "Show" : "Hide"} ${displayCode}`);
    toggleVisibility.setAttribute("aria-pressed", String(hidden));

    const eye = document.createElement("span");
    eye.className = "legend-eye";
    eye.setAttribute("aria-hidden", "true");
    toggleVisibility.appendChild(eye);

    const eyeSlash = document.createElement("span");
    eyeSlash.className = "legend-eye-slash";
    eyeSlash.setAttribute("aria-hidden", "true");
    toggleVisibility.appendChild(eyeSlash);
    toggleVisibility.addEventListener("click", () => onToggleVisibility(mod.code));

    const label = document.createElement("span");
    label.className = "legend-code";
    label.textContent = displayCode;

    const controls = document.createElement("span");
    controls.className = "legend-controls";

    const remove = document.createElement("button");
    remove.className = "legend-remove";
    remove.type = "button";
    remove.title = `Remove ${displayCode}`;
    remove.textContent = "x";
    remove.addEventListener("click", () => onRemove(mod.code));

    li.appendChild(swatch);
    li.appendChild(toggleVisibility);
    li.appendChild(label);
    controls.appendChild(remove);
    li.appendChild(controls);

    if (paletteOpen)
    {
      const palette = document.createElement("div");
      palette.className = "legend-palette";

      moduleColorPalette.forEach((color) => {
        const swatchButton = document.createElement("button");
        const selected = currentColor.toLowerCase() === color;
        swatchButton.type = "button";
        swatchButton.className = `legend-palette-swatch ${selected ? "selected" : ""}`;
        swatchButton.style.backgroundColor = color;
        swatchButton.title = `${displayCode} color ${color}`;
        swatchButton.setAttribute("aria-label", `Set ${displayCode} color to ${color}`);
        swatchButton.addEventListener("click", () => onSetColor(mod.code, color));
        palette.appendChild(swatchButton);
      });

      li.appendChild(palette);
    }

    moduleLegend.appendChild(li);
  });

  if (modules.length === 0)
  {
    const empty = document.createElement("li");
    empty.className = "legend-item empty";
    empty.textContent = "No modules selected";
    moduleLegend.appendChild(empty);
  }
}

export function renderModuleSuggestions({
  searchResults,
  moduleSearch,
  moduleCatalog,
  query,
  selectedCodes,
  isSearchFocused,
  onAddFromSuggestion,
})
{
  if (!searchResults)
  {
    return;
  }

  const normalizedQuery = String(query || "").trim().toLowerCase();
  const moduleRootCode = (code) => String(code || "").toUpperCase().replace(/-TG\d+$/i, "");
  const selectedRootSet = new Set(selectedCodes.map((code) => moduleRootCode(code)));

  const uniqueByRoot = new Map();
  moduleCatalog.forEach((mod) => {
    const rootCode = moduleRootCode(mod.code);
    if (selectedRootSet.has(rootCode) || uniqueByRoot.has(rootCode))
    {
      return;
    }

    uniqueByRoot.set(rootCode, {
      code: rootCode,
      name: String(mod.name || rootCode),
    });
  });

  const visible = [...uniqueByRoot.values()]
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { sensitivity: "base" }))
    .filter((mod) => {
      if (normalizedQuery.length === 0)
      {
        return true;
      }

      const haystack = `${mod.code} ${mod.name}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  searchResults.innerHTML = "";
  if (!isSearchFocused || visible.length === 0)
  {
    searchResults.hidden = true;
    return;
  }

  visible.forEach((mod) => {
    const item = document.createElement("li");
    item.className = "search-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-item-btn";
    button.setAttribute("aria-label", `Add ${mod.code}`);

    const code = document.createElement("span");
    code.className = "search-code";
    code.textContent = `${mod.code} ${mod.name}`;

    const action = document.createElement("span");
    action.className = "search-action";
    action.textContent = "Add";

    button.appendChild(code);
    button.appendChild(action);
    button.addEventListener("click", () => {
      moduleSearch.value = mod.code;
      onAddFromSuggestion();
      searchResults.hidden = true;
    });

    item.appendChild(button);
    searchResults.appendChild(item);
  });

  searchResults.hidden = false;
}
