export function bindEvents({
  elements,
  weekPatternOptions,
  getState,
  render,
  drawSuggestions,
  addModuleFromSearchInput,
  clearAllModules,
  scrollToDay,
  setFeedback,
  buildShareLink,
  exportIcs,
  clearFeedback,
})
{
  const {
    toggleThemeBtn,
    toggleOrientationBtn,
    toggleSquishBtn,
    weekPatternSelect,
    weekModeButtons,
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
  } = elements;

  if (toggleThemeBtn)
  {
    toggleThemeBtn.addEventListener("click", () => {
      const state = getState();
      state.theme = state.theme === "dark" ? "light" : "dark";
      render();
    });
  }

  if (toggleOrientationBtn)
  {
    toggleOrientationBtn.addEventListener("click", () => {
      const state = getState();
      state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
      render();
      scrollToDay(state.orientation, state.activeDayIndex);
    });
  }

  if (toggleSquishBtn)
  {
    toggleSquishBtn.addEventListener("click", () => {
      const state = getState();
      const nextSquish = !state.squishTime;
      state.squishTime = nextSquish;
      state.forceFullRange = !nextSquish;
      render();
    });
  }

  if (weekPatternSelect)
  {
    weekPatternSelect.addEventListener("change", (event) => {
      const state = getState();
      state.weekPattern = event.target.value;
      render();
    });
  }

  weekModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextPattern = button.dataset.weekMode;
      if (!weekPatternOptions.includes(nextPattern))
      {
        return;
      }

      const state = getState();
      state.weekPattern = nextPattern;
      render();
    });
  });

  if (moduleSearch)
  {
    moduleSearch.addEventListener("input", (event) => {
      const state = getState();
      state.search = event.target.value;
      drawSuggestions();
    });

    moduleSearch.addEventListener("focus", () => {
      const state = getState();
      state.search = moduleSearch.value;
      drawSuggestions();
    });

    moduleSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter")
      {
        event.preventDefault();
        addModuleFromSearchInput();
        if (searchResults)
        {
          searchResults.hidden = true;
        }
      }

      if (event.key === "Escape" && searchResults)
      {
        searchResults.hidden = true;
      }
    });

    moduleSearch.addEventListener("change", () => {
      addModuleFromSearchInput();
    });

    moduleSearch.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (searchResults)
        {
          searchResults.hidden = true;
        }
      }, 120);
    });

    document.addEventListener("pointerdown", (event) => {
      if (!searchResults || searchResults.hidden)
      {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node))
      {
        return;
      }

      if (moduleSearch.contains(target) || searchResults.contains(target))
      {
        return;
      }

      searchResults.hidden = true;
    });
  }

  if (clearAllBtn)
  {
    clearAllBtn.addEventListener("click", clearAllModules);
  }

  if (prevWeekBtn)
  {
    prevWeekBtn.addEventListener("click", () => {
      const state = getState();
      state.weekOffset -= 1;
      render();
      scrollToDay(state.orientation, state.activeDayIndex);
    });
  }

  if (nextWeekBtn)
  {
    nextWeekBtn.addEventListener("click", () => {
      const state = getState();
      state.weekOffset += 1;
      render();
      scrollToDay(state.orientation, state.activeDayIndex);
    });
  }

  if (todayBtn)
  {
    todayBtn.addEventListener("click", () => {
      const state = getState();
      state.weekOffset = 0;
      state.activeDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
      render();
      scrollToDay(state.orientation, state.activeDayIndex);
    });
  }

  if (shareLinkBtn)
  {
    shareLinkBtn.addEventListener("click", async () => {
      const shareLink = buildShareLink(getState());

      try
      {
        await navigator.clipboard.writeText(shareLink);
        setFeedback("Share link copied to clipboard.", true);
      }
      catch {
        setFeedback("Unable to copy share link. Copy it from your browser address bar.", true);
      }
    });
  }

  if (hideFeedbackBtn)
  {
    hideFeedbackBtn.addEventListener("click", clearFeedback);
  }

  if (printBtn)
  {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (exportIcsBtn)
  {
    exportIcsBtn.addEventListener("click", exportIcs);
  }
}
