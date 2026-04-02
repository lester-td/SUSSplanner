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

export function scrollToDay(orientation, dayIndex)
{
  const headerId = orientation === "horizontal" ? `day-col-${dayIndex}` : `day-row-${dayIndex}`;
  const header = document.getElementById(headerId);
  if (!header)
  {
    return;
  }

  header.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "center",
  });

  header.classList.add("active-day");
  window.setTimeout(() => header.classList.remove("active-day"), 280);
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
  activeDayIndex,
  dayLabel,
  onSelectDay,
})
{
  dateStrip.innerHTML = "";

  dates.forEach((date, idx) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `date-pill ${activeDayIndex === idx ? "active" : ""}`;
    pill.setAttribute("aria-label", `${days[idx]} ${dayLabel(date)}`);

    const dayText = document.createElement("span");
    dayText.className = "date-pill-day";
    dayText.textContent = days[idx];

    const dateText = document.createElement("span");
    dateText.className = "date-pill-date";
    dateText.textContent = dayLabel(date);

    pill.appendChild(dayText);
    pill.appendChild(dateText);
    pill.addEventListener("click", () => onSelectDay(idx));

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

  modules.forEach((mod) => {
    const hidden = hiddenCodes.includes(mod.code);
    const paletteOpen = openColorMenuCode === mod.code;
    const currentColor = getModuleColor(mod.code, mod.color);
    const li = document.createElement("li");
    li.className = `legend-item ${hidden ? "hidden" : ""} ${paletteOpen ? "palette-open" : ""}`;

    const swatch = document.createElement("button");
    swatch.className = `legend-swatch ${hidden ? "hidden" : ""}`;
    swatch.type = "button";
    swatch.style.backgroundColor = hidden ? `${currentColor}55` : currentColor;
    swatch.title = `Choose color for ${mod.code}`;
    swatch.setAttribute("aria-label", `Choose color for ${mod.code}`);
    swatch.setAttribute("aria-expanded", String(paletteOpen));
    swatch.addEventListener("click", () => onTogglePalette(mod.code, paletteOpen));

    const toggleVisibility = document.createElement("button");
    toggleVisibility.className = `legend-toggle ${hidden ? "is-hidden" : ""}`;
    toggleVisibility.type = "button";
    toggleVisibility.title = `${hidden ? "Show" : "Hide"} ${mod.code}`;
    toggleVisibility.setAttribute("aria-label", `${hidden ? "Show" : "Hide"} ${mod.code}`);
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
    label.textContent = mod.code;

    const controls = document.createElement("span");
    controls.className = "legend-controls";

    const remove = document.createElement("button");
    remove.className = "legend-remove";
    remove.type = "button";
    remove.title = `Remove ${mod.code}`;
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
        swatchButton.title = `${mod.code} color ${color}`;
        swatchButton.setAttribute("aria-label", `Set ${mod.code} color to ${color}`);
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
  const formatLessonInfo = (lesson) => {
    const day = String(lesson.day || "").toUpperCase();
    const start = String(lesson.start || "");
    const end = String(lesson.end || "");
    const type = String(lesson.type || "").trim();
    const venue = String(lesson.venue || "").trim();
    const startText = start.length === 4 ? `${start.slice(0, 2)}:${start.slice(2)}` : start;
    const endText = end.length === 4 ? `${end.slice(0, 2)}:${end.slice(2)}` : end;

    return [day, startText && endText ? `${startText}-${endText}` : "", type, venue]
      .filter(Boolean)
      .join(" | ");
  };

  const visible = moduleCatalog
    .filter((mod) => !selectedRootSet.has(moduleRootCode(mod.code)))
    .map((mod) => {
      const lessons = Array.isArray(mod.lessons) ? mod.lessons : [];
      const infoText = lessons.slice(0, 2).map((lesson) => formatLessonInfo(lesson)).filter(Boolean).join(" | ");
      return {
        code: String(mod.code || "").toUpperCase(),
        name: String(mod.name || moduleRootCode(mod.code)),
        infoText,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { sensitivity: "base" }))
    .filter((mod) => {
      if (normalizedQuery.length === 0)
      {
        return true;
      }

      const haystack = `${mod.code} ${mod.name} ${mod.infoText}`.toLowerCase();
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

    if (mod.infoText)
    {
      const info = document.createElement("span");
      info.className = "search-meta";
      info.textContent = mod.infoText;
      code.appendChild(document.createElement("br"));
      code.appendChild(info);
    }

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
