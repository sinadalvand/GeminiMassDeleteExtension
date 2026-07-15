// Multi-selection management module for Gemini Bulk Delete Extension
(function () {
  "use strict";

  // Toggle native collapse arrow icon visibility
  window.updateArrowVisibility = () => {
    const targetBtn = document.querySelector('button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]');
    if (!targetBtn) return;

    const arrowIcon = targetBtn.querySelector(".toggle-icon") || 
                      targetBtn.querySelector("gem-icon") || 
                      targetBtn.querySelector("mat-icon");

    if (arrowIcon) {
      if (window.GbdState.isMultiSelectActive) {
        arrowIcon.style.setProperty("display", "none", "important");
      } else {
        arrowIcon.style.display = "";
      }
    }
  };

  // Update visibility and check state of Select All checkbox
  window.updateSelectAllState = () => {
    const selectAllCb = document.getElementById("gbd-select-all-cb");
    if (!selectAllCb) return;

    const selectableCount = document.querySelectorAll('gem-nav-list-item[data-test-id="conversation"]').length;
    if (window.GbdState.isMultiSelectActive && selectableCount > 1) {
      selectAllCb.style.display = "inline-block";

      const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
      if (checkboxes.length > 0) {
        const checkedCount = Array.from(checkboxes).filter((cb) => cb.checked).length;
        
        selectAllCb.checked = checkedCount === checkboxes.length;
        selectAllCb.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
      } else {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      }
    } else {
      selectAllCb.style.display = "none";
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
  };

  // Retrieve the active conversation item, with a fallback to expanded actions menus
  window.getActiveConversationItem = () => {
    if (window.GbdState.activeConversationItem && document.body.contains(window.GbdState.activeConversationItem)) {
      return window.GbdState.activeConversationItem;
    }
    const expandedBtn = document.querySelector('gem-nav-list-item[data-test-id="conversation"] [aria-expanded="true"]') ||
                        document.querySelector('[aria-haspopup][aria-expanded="true"]') ||
                        document.querySelector('.gem-conversation-actions-menu-button[aria-expanded="true"]') ||
                        document.querySelector('gem-icon-button[aria-expanded="true"]') ||
                        document.querySelector('button[aria-expanded="true"]');
    if (expandedBtn) {
      return expandedBtn.closest('gem-nav-list-item[data-test-id="conversation"]');
    }
    return null;
  };

  // Inject Close button and Trash bin inside the Recents button block
  window.injectControls = (targetBtn) => {
    if (document.querySelector(".gbd-controls-container")) {
      return; // Already injected
    }

    window.debugLog("Target header button found. Injecting controls...");

    const container = document.createElement("div");
    container.className = "gbd-controls-container";

    const stopEvents = (e) => {
      e.stopPropagation();
    };
    container.addEventListener("click", stopEvents);
    container.addEventListener("mousedown", stopEvents);
    container.addEventListener("mouseup", stopEvents);

    // 1. Create Trash Bin button
    const trashBtn = document.createElement("button");
    trashBtn.id = "gbd-trash-btn";
    trashBtn.className = "gbd-trash-button";
    trashBtn.title = window.safeGetMessage("deleteSelected", null, "Delete selected");
    trashBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    `;
    trashBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.handleExtensionUsed();
      window.startDeletionProcess();
    });
    container.appendChild(trashBtn);

    // 2. Create Close Button (to cancel selection mode)
    const closeBtn = document.createElement("button");
    closeBtn.id = "gbd-close-btn";
    closeBtn.className = "gbd-close-button";
    closeBtn.title = window.safeGetMessage("deleteConversations_cancel", null, "Cancel");
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.GbdState.isDeleting) {
        window.GbdState.deletionAborted = true;
        closeBtn.disabled = true;
        closeBtn.style.opacity = "0.5";
        window.debugLog("User clicked close to abort deletion.");
      } else {
        window.exitMultiSelectMode();
      }
    });
    container.appendChild(closeBtn);

    // 3. Create Select All checkbox before Recents
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.id = "gbd-select-all-cb";
    selectAllCb.className = "gbd-select-all-checkbox";
    selectAllCb.title = "Select all / Deselect all";
    
    const stopSelectAllEvents = (e) => {
      e.stopPropagation();
    };
    selectAllCb.addEventListener("click", stopSelectAllEvents);
    selectAllCb.addEventListener("mousedown", stopSelectAllEvents);
    selectAllCb.addEventListener("mouseup", stopSelectAllEvents);

    selectAllCb.addEventListener("change", (e) => {
      e.stopPropagation();
      const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
      checkboxes.forEach((cb) => {
        cb.checked = selectAllCb.checked;
      });
      window.handleCheckboxChange();
    });

    const titleSpan = targetBtn.querySelector('.expandable-section-title') || 
                      targetBtn.querySelector('span');
    if (titleSpan) {
      targetBtn.insertBefore(selectAllCb, titleSpan);
    } else if (targetBtn.firstChild) {
      targetBtn.insertBefore(selectAllCb, targetBtn.firstChild);
    } else {
      targetBtn.appendChild(selectAllCb);
    }

    const arrowIcon = targetBtn.querySelector(".toggle-icon") || targetBtn.querySelector("gem-icon");
    if (arrowIcon) {
      targetBtn.insertBefore(container, arrowIcon);
    } else {
      targetBtn.appendChild(container);
    }

    if (window.GbdState.isMultiSelectActive) {
      if (!targetBtn.dataset.origPaddingStart) {
        targetBtn.dataset.origPaddingStart = targetBtn.style.paddingInlineStart || window.getComputedStyle(targetBtn).paddingInlineStart;
      }
      if (!targetBtn.dataset.origPaddingEnd) {
        targetBtn.dataset.origPaddingEnd = targetBtn.style.paddingInlineEnd || window.getComputedStyle(targetBtn).paddingInlineEnd;
      }
      targetBtn.style.paddingInlineStart = "10px";
      targetBtn.style.paddingInlineEnd = "0";
    }

    window.debugLog("Controls injected.");
    
    setTimeout(window.restoreConversationSelections, 800);
  };

  // Enter selection mode
  window.enterMultiSelectMode = () => {
    if (window.GbdState.isMultiSelectActive) return;
    window.GbdState.isMultiSelectActive = true;
    window.debugLog("Entering multi-select mode");

    window.showCheckboxes();

    const closeBtn = document.getElementById("gbd-close-btn");
    if (closeBtn) {
      closeBtn.style.display = "flex";
    }

    window.updateArrowVisibility();
    window.updateSelectAllState();

    const targetBtn = document.querySelector('button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]');
    if (targetBtn) {
      if (!targetBtn.dataset.origPaddingStart) {
        targetBtn.dataset.origPaddingStart = targetBtn.style.paddingInlineStart || window.getComputedStyle(targetBtn).paddingInlineStart;
      }
      if (!targetBtn.dataset.origPaddingEnd) {
        targetBtn.dataset.origPaddingEnd = targetBtn.style.paddingInlineEnd || window.getComputedStyle(targetBtn).paddingInlineEnd;
      }
      targetBtn.style.paddingInlineStart = "10px";
      targetBtn.style.paddingInlineEnd = "0";
    }

    window.startObservingChats();
    document.addEventListener("keydown", window.keyboardListener);
  };

  // Exit selection mode
  window.exitMultiSelectMode = () => {
    if (!window.GbdState.isMultiSelectActive) return;
    window.GbdState.isMultiSelectActive = false;
    window.debugLog("Exiting multi-select mode");
    window.GbdState.lastClickedItemIndex = -1;

    const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = false;
    });

    window.removeCheckboxes();
    window.stopObservingChats();
    document.removeEventListener("keydown", window.keyboardListener);

    const closeBtn = document.getElementById("gbd-close-btn");
    const trashBtn = document.getElementById("gbd-trash-btn");
    if (closeBtn) closeBtn.style.display = "none";
    if (trashBtn) trashBtn.style.display = "none";

    window.updateSelectAllState();
    window.updateArrowVisibility();

    const targetBtn = document.querySelector('button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]');
    if (targetBtn) {
      if (targetBtn.dataset.origPaddingStart !== undefined) {
        targetBtn.style.paddingInlineStart = targetBtn.dataset.origPaddingStart;
      }
      if (targetBtn.dataset.origPaddingEnd !== undefined) {
        targetBtn.style.paddingInlineEnd = targetBtn.dataset.origPaddingEnd;
      }
    }

    localStorage.removeItem("gbd_saved_selections");
    localStorage.removeItem("gbd_selections_timestamp");
  };

  // Prepend checkboxes to all conversations
  window.showCheckboxes = () => {
    const items = document.querySelectorAll('gem-nav-list-item[data-test-id="conversation"]');
    
    items.forEach((item, index) => {
      let checkbox = item.querySelector(".gbd-chat-checkbox");
      if (!checkbox) {
        checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gbd-chat-checkbox";
        checkbox.dataset.index = index;
        
        checkbox.addEventListener("click", (e) => {
          e.stopPropagation();
        });

        checkbox.addEventListener("change", window.handleCheckboxChange);

        if (item.firstChild) {
          item.insertBefore(checkbox, item.firstChild);
        } else {
          item.appendChild(checkbox);
        }
      }
      checkbox.style.display = "inline-block";
    });
  };

  // Remove checkboxes from all conversations
  window.removeCheckboxes = () => {
    const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
    checkboxes.forEach((cb) => {
      cb.style.display = "none";
    });
  };

  // Handle individual checkbox state changes
  window.handleCheckboxChange = () => {
    const checkedCount = document.querySelectorAll(".gbd-chat-checkbox:checked").length;
    const trashBtn = document.getElementById("gbd-trash-btn");
    
    if (trashBtn) {
      if (checkedCount > 0) {
        trashBtn.style.display = "flex";
        trashBtn.title = window.safeGetMessage("deleteN", [String(checkedCount)], `Delete (${checkedCount})`);
      } else {
        trashBtn.style.display = "none";
      }
    }

    window.updateSelectAllState();
    window.saveConversationSelections();
  };

  // Start observing chat list container for dynamically loaded conversations
  window.startObservingChats = () => {
    const container = document.getElementById("sidenav-section-content-chats");
    if (!container) {
      window.debugWarn("Chat list container not found for MutationObserver.");
      return;
    }

    if (window.GbdState.chatObserver) window.GbdState.chatObserver.disconnect();

    window.GbdState.chatObserver = new MutationObserver(() => {
      if (window.GbdState.isMultiSelectActive) {
        window.showCheckboxes();
        window.handleCheckboxChange();
        window.updateArrowVisibility();
      }
      window.checkAndShowRatingPrompt();
    });

    window.GbdState.chatObserver.observe(container, {
      childList: true,
      subtree: true
    });
  };

  window.stopObservingChats = () => {
    if (window.GbdState.chatObserver) {
      window.GbdState.chatObserver.disconnect();
      window.GbdState.chatObserver = null;
    }
  };

  // Keyboard listener for multi-select actions
  window.keyboardListener = (e) => {
    if (!window.GbdState.isMultiSelectActive) return;

    const targetTag = e.target.tagName;
    const isTextInput = (targetTag === "INPUT" && e.target.type !== "checkbox") || 
                        targetTag === "TEXTAREA" || 
                        e.target.getAttribute("contenteditable") === "true";
    if (isTextInput) {
      return;
    }

    const isKeyA = e.key === "a" || e.key === "A" || e.code === "KeyA";
    if (isKeyA && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      window.toggleSelectAll();
    }

    if (isKeyA && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      window.toggleSelectAll();
    }

    if (e.key === "Delete" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const checkedCount = document.querySelectorAll(".gbd-chat-checkbox:checked").length;
      if (checkedCount > 0) {
        e.preventDefault();
        window.startDeletionProcess();
      }
    }

    if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      window.exitMultiSelectMode();
    }
  };

  // Select or deselect all items
  window.toggleSelectAll = () => {
    const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
    if (checkboxes.length === 0) return;

    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
    });

    window.handleCheckboxChange();
  };

  // Helper to maintain the index of the last active selection
  const updateLastCheckedIndex = (allItems, currentIndex, isChecked) => {
    if (isChecked) {
      window.GbdState.lastClickedItemIndex = currentIndex;
    } else {
      if (window.GbdState.lastClickedItemIndex === currentIndex) {
        // The last checked item was unchecked, find another checked item as fallback.
        const checkedIndices = [];
        allItems.forEach((el, idx) => {
          const cb = el.querySelector(".gbd-chat-checkbox");
          if (cb && cb.checked) {
            checkedIndices.push(idx);
          }
        });
        
        if (checkedIndices.length > 0) {
          // Fallback to the checked item closest to the old index
          const closest = checkedIndices.reduce((prev, curr) => 
            Math.abs(curr - currentIndex) < Math.abs(prev - currentIndex) ? curr : prev
          );
          window.GbdState.lastClickedItemIndex = closest;
        } else {
          window.GbdState.lastClickedItemIndex = -1;
        }
      }
    }
  };

  // Handle Ctrl/Shift clicks on conversation items in selection mode
  window.handleConversationClick = (e) => {
    if (!window.GbdState.isMultiSelectActive) return;

    const item = e.target.closest('gem-nav-list-item[data-test-id="conversation"]');
    if (!item) return;

    const checkbox = item.querySelector(".gbd-chat-checkbox");
    if (!checkbox) return;

    const allItems = Array.from(document.querySelectorAll('gem-nav-list-item[data-test-id="conversation"]'));
    const currentIndex = allItems.indexOf(item);

    const isShift = e.shiftKey;

    const isClickOnCheckbox = e.target.closest('.gbd-chat-checkbox') !== null;
    const targetState = isClickOnCheckbox ? checkbox.checked : !checkbox.checked;

    if (isShift) {
      e.preventDefault();
      e.stopPropagation();

      let referenceIndex = window.GbdState.lastClickedItemIndex;
      if (referenceIndex === -1) {
        const checkedIndex = allItems.findIndex((el) => {
          const cb = el.querySelector(".gbd-chat-checkbox");
          return cb && cb.checked;
        });
        if (checkedIndex !== -1) {
          referenceIndex = checkedIndex;
        }
      }

      if (referenceIndex === -1) {
        setTimeout(() => {
          checkbox.checked = true;
          window.handleCheckboxChange();
          window.GbdState.lastClickedItemIndex = currentIndex;
        }, 0);
      } else {
        const start = Math.min(referenceIndex, currentIndex);
        const end = Math.max(referenceIndex, currentIndex);

        setTimeout(() => {
          for (let i = start; i <= end; i++) {
            const cb = allItems[i].querySelector(".gbd-chat-checkbox");
            if (cb) {
              cb.checked = targetState;
            }
          }
          window.handleCheckboxChange();
          updateLastCheckedIndex(allItems, currentIndex, targetState);
        }, 0);
      }
    } 
    else {
      // Normal click: if it was directly on the checkbox, sync the last checked index
      if (isClickOnCheckbox) {
        updateLastCheckedIndex(allItems, currentIndex, checkbox.checked);
      } else {
        window.GbdState.lastClickedItemIndex = currentIndex;
      }
    }
  };

  // Hold/Long-press to trigger Selection Mode
  window.handleLongPressStart = (e) => {
    if (e.type === "mousedown" && e.button !== 0) return;
    if (window.GbdState.isMultiSelectActive) return;

    const item = e.target.closest('gem-nav-list-item[data-test-id="conversation"]');
    if (!item) return;

    if (e.target.closest('[data-test-id="actions-menu-button"]') || 
        e.target.closest('.gem-conversation-actions-menu-button') ||
        e.target.closest('.gbd-chat-checkbox')) {
      return;
    }

    window.GbdState.longPressTriggered = false;
    window.GbdState.longPressTimer = setTimeout(() => {
      window.GbdState.longPressTriggered = true;
      window.GbdState.blockNextClick = true;

      window.enterMultiSelectMode();

      const cb = item.querySelector(".gbd-chat-checkbox");
      if (cb) {
        cb.checked = true;
        window.handleCheckboxChange();
      }

      item.classList.add("gbd-longpress-flash");
      setTimeout(() => item.classList.remove("gbd-longpress-flash"), 300);
    }, 600);
  };

  window.handleLongPressEnd = (e) => {
    if (window.GbdState.longPressTimer) {
      clearTimeout(window.GbdState.longPressTimer);
      window.GbdState.longPressTimer = null;
    }
  };

  window.trackActiveItem = (e) => {
    const btn = e.target.closest('[data-test-id="actions-menu-button"]') ||
                e.target.closest('button[aria-label*="actions" i]') ||
                e.target.closest('button[aria-label*="menu" i]') ||
                e.target.closest('button[aria-label*="options" i]') ||
                e.target.closest('.gem-conversation-actions-menu-button') ||
                e.target.closest('.actions-menu-button');
    if (btn) {
      window.GbdState.activeConversationItem = btn.closest('gem-nav-list-item[data-test-id="conversation"]');
      window.debugLog("Tracked active conversation item.");
    }
  };
})();
