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
    timetableWrap,
  } = elements;

  if (timetableWrap)
  {
    let dragState = {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0,
      pointerId: null,
      moved: false,
    };

    const resetDrag = () => {
      if (!dragState.active)
      {
        return;
      }

      dragState.active = false;
      dragState.pointerId = null;
      timetableWrap.classList.remove("is-dragging");
      document.body.classList.remove("is-dragging-timetable");
    };

    timetableWrap.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.pointerType !== "mouse")
      {
        return;
      }

      dragState = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: timetableWrap.scrollLeft,
        startTop: timetableWrap.scrollTop,
        pointerId: event.pointerId,
        moved: false,
      };

      timetableWrap.classList.add("is-dragging");
      document.body.classList.add("is-dragging-timetable");
      timetableWrap.setPointerCapture(event.pointerId);
    });

    timetableWrap.addEventListener("pointermove", (event) => {
      if (!dragState.active || event.pointerId !== dragState.pointerId)
      {
        return;
      }

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (!dragState.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3))
      {
        dragState.moved = true;
      }

      if (!dragState.moved)
      {
        return;
      }

      timetableWrap.scrollLeft = dragState.startLeft - dx;
      timetableWrap.scrollTop = dragState.startTop - dy;
      event.preventDefault();
    });

    timetableWrap.addEventListener("pointerup", resetDrag);
    timetableWrap.addEventListener("pointercancel", resetDrag);
    timetableWrap.addEventListener("lostpointercapture", resetDrag);

    timetableWrap.addEventListener("click", (event) => {
      if (!dragState.moved)
      {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragState.moved = false;
    }, { capture: true });
  }

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
