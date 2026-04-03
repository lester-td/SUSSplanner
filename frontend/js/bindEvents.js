export function bindEvents({
  elements,
  getState,
  render,
  drawSuggestions,
  addModuleFromSearchInput,
  clearAllModules,
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

  let latestShareLink = "";
  const feedbackRow = hideFeedbackBtn && hideFeedbackBtn.parentElement instanceof HTMLElement
    ? hideFeedbackBtn.parentElement
    : null;

  let feedbackCopyBtn = null;
  if (feedbackRow)
  {
    feedbackCopyBtn = document.createElement("button");
    feedbackCopyBtn.type = "button";
    feedbackCopyBtn.className = "feedback-hide";
    feedbackCopyBtn.textContent = "Copy";
    feedbackCopyBtn.hidden = true;
    feedbackCopyBtn.setAttribute("aria-label", "Copy share link");
    feedbackRow.insertBefore(feedbackCopyBtn, hideFeedbackBtn || null);

    feedbackCopyBtn.addEventListener("click", async () => {
      if (!latestShareLink)
      {
        return;
      }

      try
      {
        await navigator.clipboard.writeText(latestShareLink);
        setFeedback(`Share link copied to clipboard: ${latestShareLink}`, true);
      }
      catch {
        setFeedback(`Share link: ${latestShareLink}`, true);
      }
    });
  }

  const showFeedbackCopyButton = (link) => {
    latestShareLink = String(link || "");
    if (feedbackCopyBtn)
    {
      feedbackCopyBtn.hidden = !latestShareLink;
    }
  };

  const hideFeedbackCopyButton = () => {
    latestShareLink = "";
    if (feedbackCopyBtn)
    {
      feedbackCopyBtn.hidden = true;
    }
  };

  if (timetableWrap)
  {
    const isInteractiveTarget = (target) => {
      if (!(target instanceof Element))
      {
        return false;
      }

      return Boolean(target.closest("button, input, select, textarea, a, .event, .legend-palette"));
    };

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

      if (isInteractiveTarget(event.target))
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

      if (!dragState.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6))
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
    });
  }

  if (nextWeekBtn)
  {
    nextWeekBtn.addEventListener("click", () => {
      const state = getState();
      state.weekOffset += 1;
      render();
    });
  }

  if (todayBtn)
  {
    todayBtn.addEventListener("click", () => {
      const state = getState();
      state.weekOffset = 0;
      render();
    });
  }

  if (shareLinkBtn)
  {
    shareLinkBtn.addEventListener("click", async () => {
      const sharePath = buildShareLink(getState());
      const normalizedPath = sharePath.startsWith("/") ? sharePath : `/${sharePath}`;
      const shareLink = `https://sussmods.dev${normalizedPath}`;

      try
      {
        await navigator.clipboard.writeText(shareLink);
        setFeedback(`Share link copied to clipboard: ${shareLink}`, true);
        showFeedbackCopyButton(shareLink);
      }
      catch {
        setFeedback(`Share link: ${shareLink}`, true);
        showFeedbackCopyButton(shareLink);
      }
    });
  }

  if (hideFeedbackBtn)
  {
    hideFeedbackBtn.addEventListener("click", () => {
      hideFeedbackCopyButton();
      clearFeedback();
    });
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
