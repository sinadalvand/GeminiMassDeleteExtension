// Content script for Gemini Bulk Delete Extension

(function () {
  "use strict";

  const debugLog = (...args) => {
    // console.log("[GBD Injector]", ...args);
  };

  const debugWarn = (...args) => {
    // console.warn("[GBD Injector Warning]", ...args);
  };

  const safeGetMessage = (messageName, substitutions = null, fallback = "") => {
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        const msg = chrome.i18n.getMessage(messageName, substitutions);
        if (msg) return msg;
      }
    } catch (e) {
      // Extension context might be invalidated
    }
    return fallback;
  };

  let isMultiSelectActive = false;
  let chatObserver = null;
  let headerObserver = null;
  let overlayObserver = null;
  let activeConversationItem = null;
  let longPressTimer = null;
  let longPressTriggered = false;
  let blockNextClick = false;
  let isDeleting = false;
  let deletionAborted = false;
  let devPromptDismissedThisSession = false;

  // Storage utility class for Gemini Bulk Delete using chrome.storage.local
  const GbdStorage = {
    get: (keys) => {
      return new Promise((resolve) => {
        try {
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(keys, (items) => {
              resolve(items || {});
            });
          } else {
            // Fallback for non-extension environments (like local mockup or sample page)
            const result = {};
            keys.forEach(k => {
              const val = localStorage.getItem(k);
              try {
                result[k] = val !== null ? JSON.parse(val) : undefined;
              } catch (e) {
                result[k] = val;
              }
            });
            resolve(result);
          }
        } catch (e) {
          resolve({});
        }
      });
    },

    set: (items) => {
      return new Promise((resolve) => {
        try {
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set(items, () => {
              resolve();
            });
          } else {
            Object.entries(items).forEach(([k, v]) => {
              localStorage.setItem(k, JSON.stringify(v));
            });
            resolve();
          }
        } catch (e) {
          resolve();
        }
      });
    },

    getState: async () => {
      const isDev = (() => {
        try {
          if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
            const manifest = chrome.runtime.getManifest();
            return !manifest.update_url;
          }
        } catch (e) {}
        return true; // Fallback for local files/testing
      })();

      const defaultState = {
        gbd_use_count: 0,
        gbd_rating_dismissed_until: isDev ? 0 : 3,
        gbd_already_rated: false
      };
      const saved = await GbdStorage.get(Object.keys(defaultState));
      
      const parseVal = (val, def) => {
        if (val === undefined || val === null) return def;
        if (typeof def === "boolean") return val === true || val === "true";
        if (typeof def === "number") return parseInt(val, 10);
        return val;
      };

      return {
        gbd_use_count: parseVal(saved.gbd_use_count, defaultState.gbd_use_count),
        gbd_rating_dismissed_until: parseVal(saved.gbd_rating_dismissed_until, defaultState.gbd_rating_dismissed_until),
        gbd_already_rated: parseVal(saved.gbd_already_rated, defaultState.gbd_already_rated)
      };
    },

    dismissPrompt: async (currentUses) => {
      await GbdStorage.set({ gbd_rating_dismissed_until: currentUses + 15 });
    },

    markAsRated: async () => {
      await GbdStorage.set({ gbd_already_rated: true });
    }
  };

  const isDevMode = () => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        return !manifest.update_url;
      }
    } catch (e) {}
    return true; // Fallback for local files/testing
  };

  const findActivityControlItem = () => {
    const btn = document.querySelector('button[aria-label="Gemini Apps Activity"]') ||
                document.querySelector('[data-test-id="desktop-bard-activity-control"]') ||
                document.querySelector('gem-nav-list-item[title="Activity"]');
    if (btn) {
      return btn.closest('gem-nav-list-item') || btn;
    }
    return null;
  };

  const checkAndShowRatingPrompt = async (currentCount = null, savedState = null) => {
    try {
      const state = savedState || await GbdStorage.getState();
      const count = currentCount !== null ? currentCount : state.gbd_use_count;
      const isDev = isDevMode();
      
      if (!isDev && state.gbd_already_rated) {
        const box = document.getElementById("gbd-rating-box");
        if (box) box.remove();
        return;
      }
      
      if (isDev) {
        if (devPromptDismissedThisSession) {
          const box = document.getElementById("gbd-rating-box");
          if (box) box.remove();
        } else {
          renderRatingPrompt(count);
        }
      } else if (count >= state.gbd_rating_dismissed_until) {
        renderRatingPrompt(count);
      } else {
        const box = document.getElementById("gbd-rating-box");
        if (box) box.remove();
      }
    } catch (e) {
      debugWarn("Error showing rating prompt:", e);
    }
  };

  const renderRatingPrompt = (currentCount) => {
    if (document.getElementById("gbd-rating-box")) {
      return;
    }

    const activityItem = findActivityControlItem();
    if (!activityItem) {
      // Retry in a bit if container not loaded yet
      setTimeout(() => renderRatingPrompt(currentCount), 1000);
      return;
    }

    const ratingBox = document.createElement("div");
    ratingBox.id = "gbd-rating-box";
    ratingBox.className = "gbd-rating-container";
    
    ratingBox.innerHTML = `
      <button id="gbd-rating-close-btn" class="gbd-rating-close" title="Dismiss">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
      <div class="gbd-rating-title title-text gds-body-s">Enjoying Gemini Mass Delete? Rate us!</div>
      <div class="gbd-stars-container">
        ${[1, 2, 3, 4, 5].map(star => `
          <svg class="gbd-star-icon" data-value="${star}" viewBox="0 0 24 24" width="22" height="22">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        `).join("")}
      </div>
    `;

    // Insert directly above the Activity list item
    activityItem.parentNode.insertBefore(ratingBox, activityItem);

    // Close button: dismiss for 15 more uses
    const closeBtn = ratingBox.querySelector("#gbd-rating-close-btn");
    closeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      ratingBox.remove();
      
      if (isDevMode()) {
        devPromptDismissedThisSession = true;
      } else {
        await GbdStorage.dismissPrompt(currentCount);
      }
    });

    // Make the entire rating box clickable to redirect to reviews
    ratingBox.addEventListener("click", async (e) => {
      // Ignore clicks on the close button (handled by closeBtn listener)
      if (e.target.closest("#gbd-rating-close-btn")) {
        return;
      }
      
      e.stopPropagation();
      e.preventDefault();
      
      if (isDevMode()) {
        devPromptDismissedThisSession = true;
      } else {
        await GbdStorage.markAsRated();
      }
      
      ratingBox.remove();
      window.open("https://chromewebstore.google.com/detail/gemini-mass-delete/jlbohokibiohlgkkahhpmcjehmhjdgpd/reviews", "_blank");
    });

    // Stars hover effects
    const stars = ratingBox.querySelectorAll(".gbd-star-icon");
    stars.forEach(star => {
      star.addEventListener("mouseover", () => {
        const val = parseInt(star.dataset.value, 10);
        stars.forEach(s => {
          const sVal = parseInt(s.dataset.value, 10);
          if (sVal <= val) {
            s.classList.add("hovered");
          } else {
            s.classList.remove("hovered");
          }
        });
      });

      star.addEventListener("mouseout", () => {
        stars.forEach(s => s.classList.remove("hovered"));
      });
    });
  };

  const handleExtensionUsed = async () => {
    try {
      const state = await GbdStorage.getState();
      const newCount = state.gbd_use_count + 1;
      await GbdStorage.set({ gbd_use_count: newCount });
      debugLog(`Extension used ${newCount} times.`);
      checkAndShowRatingPrompt(newCount, state);
    } catch (e) {
      debugWarn("Error in handleExtensionUsed:", e);
    }
  };

  // Load stylesheet dynamically
  if (!document.getElementById("gbd-tokens-stylesheet")) {
    const link = document.createElement("link");
    link.id = "gbd-tokens-stylesheet";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("style/tokens.css");
    document.head.appendChild(link);
    debugLog("Stylesheet injected.");
  }

  // Track which conversation item's options menu is being opened
  const trackActiveItem = (e) => {
    const btn = e.target.closest('[data-test-id="actions-menu-button"]') ||
                e.target.closest('button[aria-label*="actions" i]') ||
                e.target.closest('button[aria-label*="menu" i]') ||
                e.target.closest('button[aria-label*="options" i]') ||
                e.target.closest('.gem-conversation-actions-menu-button') ||
                e.target.closest('.actions-menu-button');
    if (btn) {
      activeConversationItem = btn.closest('gem-nav-list-item[data-test-id="conversation"]');
      debugLog("Tracked active conversation item.");
    }
  };

  document.addEventListener("mousedown", trackActiveItem, true);
  document.addEventListener("click", trackActiveItem, true);

  // Toggle native collapse arrow icon visibility
  const updateArrowVisibility = () => {
    const targetBtn = document.querySelector('button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]');
    if (!targetBtn) return;

    const arrowIcon = targetBtn.querySelector(".toggle-icon") || 
                      targetBtn.querySelector("gem-icon") || 
                      targetBtn.querySelector("mat-icon");

    if (arrowIcon) {
      if (isMultiSelectActive) {
        arrowIcon.style.setProperty("display", "none", "important");
      } else {
        arrowIcon.style.display = "";
      }
    }
  };

  // Update visibility and check state of Select All checkbox
  const updateSelectAllState = () => {
    const selectAllCb = document.getElementById("gbd-select-all-cb");
    if (!selectAllCb) return;

    const selectableCount = document.querySelectorAll('gem-nav-list-item[data-test-id="conversation"]').length;
    if (isMultiSelectActive && selectableCount > 1) {
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
  const getActiveConversationItem = () => {
    if (activeConversationItem && document.body.contains(activeConversationItem)) {
      return activeConversationItem;
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

  // Monitor DOM overlays for Material options menus
  const startOverlayObserver = () => {
    if (overlayObserver) return;

    overlayObserver = new MutationObserver(() => {
      // Manage options menu injection inside cdk-overlay-pane elements
      const overlayPanes = document.querySelectorAll(".cdk-overlay-pane");
      overlayPanes.forEach((pane) => {
        const menuContent = pane.querySelector(".mat-mdc-menu-content") || 
                            pane.querySelector('[role="menu"]') || 
                            pane;

        const selectBtn = menuContent.querySelector(".gbd-select-menu-item");
        if (!selectBtn) {
          const deleteBtn = menuContent.querySelector('[data-test-id="delete-button"]') ||
                            menuContent.querySelector('button[aria-label*="delete"]') ||
                            menuContent.querySelector('button.delete-btn');

          if (deleteBtn) {
            injectSelectMenuItem(menuContent);
          }
        } else {
          // If selectBtn already exists, ensure it remains the last child of its parent
          if (selectBtn.nextSibling) {
            selectBtn.parentNode.appendChild(selectBtn);
          }
        }
      });

      // Enforce collapse arrow visibility on DOM changes
      updateArrowVisibility();
    });

    overlayObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    debugLog("Overlay observer started.");
  };

  // Inject Select/Deselect button into the options menu content under the Delete button
  const injectSelectMenuItem = (menuContent) => {
    const deleteBtn = menuContent.querySelector('[data-test-id="delete-button"]') ||
                      menuContent.querySelector('button[aria-label*="delete"]') ||
                      menuContent.querySelector('button.delete-btn');

    if (!deleteBtn) return;

    // Create Select button
    const selectBtn = document.createElement("button");
    selectBtn.className = "mat-mdc-menu-item mat-focus-indicator lm-menu-item-theme ng-star-inserted gbd-select-menu-item";
    selectBtn.setAttribute("role", "menuitem");
    selectBtn.setAttribute("tabindex", "0");
    selectBtn.setAttribute("aria-disabled", "false");

    // Determine selection state
    let isChecked = false;
    const activeItem = getActiveConversationItem();
    if (activeItem) {
      const cb = activeItem.querySelector(".gbd-chat-checkbox");
      if (cb && cb.checked) {
        isChecked = true;
      }
    }

    const labelText = isChecked ? "Unselect" : "Select";
    const iconSvg = isChecked ? 
      `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
         <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
       </svg>` :
      `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
         <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
       </svg>`;

    selectBtn.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <span class="gem-menu-item-icon" style="margin-right: 12px; display: inline-flex; align-items: center;">
          ${iconSvg}
        </span>
        <span class="gds-body-m gem-menu-item-label">${labelText}</span>
      </span>
      <div class="mat-ripple mat-mdc-menu-ripple"></div>
    `;

    selectBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const activeItem = getActiveConversationItem();

      // Dismiss options dropdown menu
      const backdrop = document.querySelector(".cdk-overlay-backdrop");
      if (backdrop) {
        backdrop.click();
      }

      if (activeItem) {
        const cb = activeItem.querySelector(".gbd-chat-checkbox");
        let nextChecked = true;

        if (!isMultiSelectActive) {
          enterMultiSelectMode();
          const newCb = activeItem.querySelector(".gbd-chat-checkbox");
          if (newCb) {
            newCb.checked = true;
            nextChecked = true;
            handleCheckboxChange();
          }
        } else {
          if (cb) {
            cb.checked = !cb.checked;
            nextChecked = cb.checked;
            handleCheckboxChange();
          }
        }

        // Dynamically update this menu item's label and icon to match the new state
        const labelEl = selectBtn.querySelector(".gem-menu-item-label");
        const iconEl = selectBtn.querySelector(".gem-menu-item-icon");
        if (labelEl && iconEl) {
          labelEl.textContent = nextChecked ? "Unselect" : "Select";
          iconEl.innerHTML = nextChecked ? 
            `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
               <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
             </svg>` :
            `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
               <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
             </svg>`;
        }
      }
    });

    // Insert as the last item in the options menu
    deleteBtn.parentNode.appendChild(selectBtn);
    
    debugLog("Select menu item injected under Delete.");
  };

  // Wait for the Recents button block
  const waitForHeader = () => {
    const selector = 'button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]';
    
    const headerBtn = document.querySelector(selector);
    if (headerBtn) {
      injectControls(headerBtn);
      return;
    }

    if (headerObserver) headerObserver.disconnect();

    headerObserver = new MutationObserver((mutations, observer) => {
      const btn = document.querySelector(selector);
      if (btn) {
        injectControls(btn);
        observer.disconnect();
      }
    });

    headerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  // Inject Close button and Trash bin inside the Recents button block
  const injectControls = (targetBtn) => {
    if (document.querySelector(".gbd-controls-container")) {
      return; // Already injected
    }

    debugLog("Target header button found. Injecting controls...");

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
    trashBtn.title = safeGetMessage("deleteSelected", null, "Delete selected");
    trashBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    `;
    trashBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleExtensionUsed();
      startDeletionProcess();
    });
    container.appendChild(trashBtn);

    // 2. Create Close Button (to cancel selection mode)
    const closeBtn = document.createElement("button");
    closeBtn.id = "gbd-close-btn";
    closeBtn.className = "gbd-close-button";
    closeBtn.title = safeGetMessage("deleteConversations_cancel", null, "Cancel");
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDeleting) {
        deletionAborted = true;
        closeBtn.disabled = true;
        closeBtn.style.opacity = "0.5";
        debugLog("User clicked close to abort deletion.");
      } else {
        exitMultiSelectMode();
      }
    });
    container.appendChild(closeBtn);

    // 3. Create Select All checkbox before Recents
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.id = "gbd-select-all-cb";
    selectAllCb.className = "gbd-select-all-checkbox";
    selectAllCb.title = "Select all / Deselect all";
    
    // Stop propagation so clicking select-all doesn't collapse/expand Recents
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
      handleCheckboxChange();
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

    // Insert inside the button block, before the arrow toggle icon if it exists
    const arrowIcon = targetBtn.querySelector(".toggle-icon") || targetBtn.querySelector("gem-icon");
    if (arrowIcon) {
      targetBtn.insertBefore(container, arrowIcon);
    } else {
      targetBtn.appendChild(container);
    }

    // Apply active padding selection styles if active during injection
    if (isMultiSelectActive) {
      if (!targetBtn.dataset.origPaddingStart) {
        targetBtn.dataset.origPaddingStart = targetBtn.style.paddingInlineStart || window.getComputedStyle(targetBtn).paddingInlineStart;
      }
      if (!targetBtn.dataset.origPaddingEnd) {
        targetBtn.dataset.origPaddingEnd = targetBtn.style.paddingInlineEnd || window.getComputedStyle(targetBtn).paddingInlineEnd;
      }
      targetBtn.style.paddingInlineStart = "10px";
      targetBtn.style.paddingInlineEnd = "0";
    }

    debugLog("Controls injected.");
    
    // Check if we have saved selections to restore
    setTimeout(restoreConversationSelections, 800);
  };

  // Enter selection mode
  const enterMultiSelectMode = () => {
    if (isMultiSelectActive) return;
    isMultiSelectActive = true;
    debugLog("Entering multi-select mode");

    // Display checkboxes
    showCheckboxes();

    // Show Close button
    const closeBtn = document.getElementById("gbd-close-btn");
    if (closeBtn) {
      closeBtn.style.display = "flex";
    }

    // Hide native arrow icon
    updateArrowVisibility();

    // Show Select All checkbox if appropriate
    updateSelectAllState();

    // Apply Toggle Recents padding adjustments
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

    startObservingChats();
    document.addEventListener("keydown", keyboardListener);
  };

  // Exit selection mode
  const exitMultiSelectMode = () => {
    if (!isMultiSelectActive) return;
    isMultiSelectActive = false;
    debugLog("Exiting multi-select mode");

    // Uncheck all checkboxes
    const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = false;
    });

    // Remove checkboxes
    removeCheckboxes();
    stopObservingChats();
    document.removeEventListener("keydown", keyboardListener);

    // Hide control buttons
    const closeBtn = document.getElementById("gbd-close-btn");
    const trashBtn = document.getElementById("gbd-trash-btn");
    if (closeBtn) closeBtn.style.display = "none";
    if (trashBtn) trashBtn.style.display = "none";

    // Hide Select All checkbox
    updateSelectAllState();

    // Show native arrow icon again
    updateArrowVisibility();

    // Restore Toggle Recents padding
    const targetBtn = document.querySelector('button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]');
    if (targetBtn) {
      if (targetBtn.dataset.origPaddingStart !== undefined) {
        targetBtn.style.paddingInlineStart = targetBtn.dataset.origPaddingStart;
      }
      if (targetBtn.dataset.origPaddingEnd !== undefined) {
        targetBtn.style.paddingInlineEnd = targetBtn.dataset.origPaddingEnd;
      }
    }

    // Clear saved selections
    localStorage.removeItem("gbd_saved_selections");
    localStorage.removeItem("gbd_selections_timestamp");
  };

  // Prepend checkboxes to all conversations
  const showCheckboxes = () => {
    const items = document.querySelectorAll('gem-nav-list-item[data-test-id="conversation"]');
    
    items.forEach((item, index) => {
      let checkbox = item.querySelector(".gbd-chat-checkbox");
      if (!checkbox) {
        checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gbd-chat-checkbox";
        checkbox.dataset.index = index;
        
        // Stop propagation so that clicking the checkbox doesn't trigger item navigation
        checkbox.addEventListener("click", (e) => {
          e.stopPropagation();
        });

        checkbox.addEventListener("change", handleCheckboxChange);

        // Prepend checkbox to the list item
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
  const removeCheckboxes = () => {
    const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
    checkboxes.forEach((cb) => {
      cb.style.display = "none";
    });
  };

  // Handle individual checkbox state changes
  const handleCheckboxChange = () => {
    const checkedCount = document.querySelectorAll(".gbd-chat-checkbox:checked").length;
    const trashBtn = document.getElementById("gbd-trash-btn");
    
    if (trashBtn) {
      if (checkedCount > 0) {
        trashBtn.style.display = "flex";
        trashBtn.title = safeGetMessage("deleteN", [String(checkedCount)], `Delete (${checkedCount})`);
      } else {
        trashBtn.style.display = "none";
      }
    }

    // Keep Select All checkbox in sync
    updateSelectAllState();
  };

  // Start observing chat list container for dynamically loaded conversations
  const startObservingChats = () => {
    const container = document.getElementById("sidenav-section-content-chats");
    if (!container) {
      debugWarn("Chat list container not found for MutationObserver.");
      return;
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver(() => {
      if (isMultiSelectActive) {
        showCheckboxes();
        handleCheckboxChange();
        updateArrowVisibility();
      }
      checkAndShowRatingPrompt();
    });

    chatObserver.observe(container, {
      childList: true,
      subtree: true
    });
  };

  const stopObservingChats = () => {
    if (chatObserver) {
      chatObserver.disconnect();
      chatObserver = null;
    }
  };

  // Keyboard listener for multi-select actions
  const keyboardListener = (e) => {
    if (!isMultiSelectActive) return;

    // Skip shortcuts if user is typing in inputs or contenteditable containers
    const targetTag = e.target.tagName;
    if (targetTag === "INPUT" || targetTag === "TEXTAREA" || e.target.getAttribute("contenteditable") === "true") {
      return;
    }

    // Shift + A: Select / Deselect all
    if (e.key === "A" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggleSelectAll();
    }

    // Delete: Trigger deletion of selected items
    if (e.key === "Delete" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const checkedCount = document.querySelectorAll(".gbd-chat-checkbox:checked").length;
      if (checkedCount > 0) {
        e.preventDefault();
        startDeletionProcess();
      }
    }

    // Escape: Exit multi-select mode
    if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      exitMultiSelectMode();
    }
  };

  // Select or deselect all items
  const toggleSelectAll = () => {
    const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");
    if (checkboxes.length === 0) return;

    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
    });

    handleCheckboxChange();
  };

  // Helper to query element from selectors list
  const querySelectors = (selectors, parent = document) => {
    if (!parent) return null;
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  };

  // Find button by text or aria-label fallback
  const findButtonByText = (terms, parent = document) => {
    if (!parent) return null;
    const buttons = parent.querySelectorAll("button");
    for (const btn of buttons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      const label = (btn.getAttribute("aria-label") || "").toLowerCase();
      for (const term of terms) {
        const termLower = term.toLowerCase();
        if (text.includes(termLower) || label.includes(termLower)) {
          return btn;
        }
      }
    }
    return null;
  };

  // Wait for element to become actionable
  const waitForElement = (selectors, parent = document, timeout = 5000, type = "") => {
    return new Promise((resolve) => {
      const getElement = () => {
        let foundEl = querySelectors(selectors, parent);
        if (!foundEl) {
          if (type === "delete") {
            foundEl = findButtonByText(["delete"], parent);
          } else if (type === "confirm") {
            foundEl = findButtonByText(["delete", "confirm", "yes"], parent);
          }
        }
        return foundEl;
      };

      let el = getElement();
      if (el && el.offsetParent !== null && !el.disabled) {
        return resolve(el);
      }

      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 100;
        let foundEl = getElement();
        if (foundEl && foundEl.offsetParent !== null && !foundEl.disabled) {
          clearInterval(interval);
          resolve(foundEl);
        } else if (elapsed >= timeout) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Simulate standard mouse click flow (hover/pointer interaction sequence)
  const simulateClick = (el) => {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
    } catch (e) {
      el.click();
    }
  };

  // Direct, simplified inline deletion process
  const startDeletionProcess = async () => {
    const checkedBoxes = Array.from(document.querySelectorAll(".gbd-chat-checkbox:checked")).reverse();
    if (checkedBoxes.length === 0) return;

    const trashBtn = document.getElementById("gbd-trash-btn");
    const closeBtn = document.getElementById("gbd-close-btn");
    const container = document.querySelector(".gbd-controls-container");

    isDeleting = true;
    deletionAborted = false;

    if (trashBtn) {
      trashBtn.style.display = "none"; // Hide trash button during deletion
    }

    // Hide overlay container to prevent user from seeing dynamic menus/dialogs
    document.body.classList.add("gbd-deleting-active");

    // Disable all list checkboxes and the header checkbox to make them gray and unclickable
    const allCbs = document.querySelectorAll(".gbd-chat-checkbox, #gbd-select-all-cb");
    allCbs.forEach((cb) => {
      cb.disabled = true;
    });

    // Add progress class to container to make it a progress bar
    if (container) {
      container.classList.add("gbd-progress-active");
      
      // Create progress label span
      const progressLabel = document.createElement("span");
      progressLabel.id = "gbd-progress-label";
      progressLabel.textContent = `Delete 0/${checkedBoxes.length}`;
      if (closeBtn) {
        container.insertBefore(progressLabel, closeBtn);
      } else {
        container.appendChild(progressLabel);
      }
    }

    const total = checkedBoxes.length;
    let current = 0;

    try {
      for (const cb of checkedBoxes) {
        if (deletionAborted) {
          debugLog("Exiting deletion loop early because user aborted.");
          break;
        }

        // Update progress bar styling and label
        if (container) {
          const progressLabel = document.getElementById("gbd-progress-label");
          if (progressLabel) {
            progressLabel.textContent = `Delete ${current}/${total}`;
          }
          const percent = (current / total) * 100;
          container.style.background = `linear-gradient(to right, rgba(var(--gbd-progress-rgb), 0.2) ${percent}%, rgba(var(--gbd-progress-rgb), 0.05) ${percent}%)`;
        }

        const item = cb.parentElement;
        if (!item) continue;

        try {
          // Target the actions button prioritizing data-test-id or options labels
          let actionsBtn = item.querySelector('[data-test-id="actions-menu-button"]') ||
                           item.querySelector('button[aria-label*="options" i]') ||
                           item.querySelector('button[aria-label*="actions" i]') ||
                           item.querySelector('button[aria-label*="menu" i]') ||
                           item.querySelector('.gem-conversation-actions-menu-button') ||
                           item.querySelector('button.menu-button') ||
                           item.querySelector('button.actions-button');

          // Fallback: search buttons inside the item for a "more_vert" icon (language-independent)
          if (!actionsBtn) {
            const buttons = item.querySelectorAll('button');
            for (const btn of buttons) {
              const icon = btn.querySelector('mat-icon');
              if (icon && (icon.getAttribute('fonticon') === 'more_vert' || 
                           icon.getAttribute('data-mat-icon-name') === 'more_vert' ||
                           icon.textContent.includes('more_vert'))) {
                actionsBtn = btn;
                break;
              }
            }
          }

          if (!actionsBtn) continue;

          // 1. Open actions menu
          simulateClick(actionsBtn);

          // 2. Wait for the menu panel dropdown container specifically
          const menuPanel = await waitForElement(['.mat-mdc-menu-panel', '[role="menu"]', '.cdk-overlay-pane'], document, 3000);
          if (!menuPanel) continue;
          if (deletionAborted) break;

          // 3. Find and click the delete button in the menu panel
          const deleteSelectors = [
            'button[data-test-id="delete-button"]',
            'button[aria-label*="delete" i]',
            'button.delete-btn'
          ];
          const deleteBtn = await waitForElement(deleteSelectors, menuPanel, 3000, "delete");
          if (!deleteBtn) continue;
          if (deletionAborted) break;
          simulateClick(deleteBtn);

          // 4. Wait for the confirmation dialog container specifically
          const dialogSelectors = [
            '.mat-mdc-dialog-container',
            'mat-dialog-container',
            '[role="dialog"]',
            '.modal-container'
          ];
          const dialogContainer = await waitForElement(dialogSelectors, document, 3000);
          if (!dialogContainer) continue;
          if (deletionAborted) break;

          // 5. Find and click confirmation delete button in popup dialog
          const confirmSelectors = [
            'button[data-test-id="confirm-button"]',
            'button[aria-label*="confirm" i]',
            'button.confirm-btn'
          ];
          const confirmBtn = await waitForElement(confirmSelectors, dialogContainer, 3000, "confirm");
          if (!confirmBtn) continue;
          if (deletionAborted) break;
          simulateClick(confirmBtn);

          // 6. Wait for the list item to be removed from the DOM tree
          let removed = false;
          for (let i = 0; i < 50; i++) {
            if (deletionAborted) break;
            if (!document.body.contains(item) || item.offsetParent === null) {
              removed = true;
              break;
            }
            await delay(100);
          }
          if (!removed) {
            // If not removed from DOM, force close dialog in case it got stuck
            document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
            await delay(200);
          } else {
            current++;
          }
        } catch (err) {
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
          await delay(200);
        }

        // Wait 300ms before doing the next deletion
        await delay(300);
      }

      // Set final progress bar state
      if (container && !deletionAborted) {
        const progressLabel = document.getElementById("gbd-progress-label");
        if (progressLabel) {
          progressLabel.textContent = `Delete ${total}/${total}`;
        }
        container.style.background = `linear-gradient(to right, rgba(var(--gbd-progress-rgb), 0.2) 100%, rgba(var(--gbd-progress-rgb), 0.05) 100%)`;
        await delay(150); // Small display delay for final state
      }
    } finally {
      if (deletionAborted) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
      }

      // Re-enable all checkboxes
      const allCbs = document.querySelectorAll(".gbd-chat-checkbox, #gbd-select-all-cb");
      allCbs.forEach((cb) => {
        cb.disabled = false;
      });

      // Cleanup UI changes from progress bar
      if (container) {
        container.classList.remove("gbd-progress-active");
        container.style.background = "";
        const progressLabel = document.getElementById("gbd-progress-label");
        if (progressLabel) {
          progressLabel.remove();
        }
      }

      if (trashBtn) {
        trashBtn.style.display = ""; // Show trash button again
      }

      // Restore overlays visibility
      document.body.classList.remove("gbd-deleting-active");

      isDeleting = false;
      deletionAborted = false;

      if (closeBtn) {
        closeBtn.disabled = false;
        closeBtn.style.opacity = "";
      }

      exitMultiSelectMode();
    }
  };

  // Save current checkbox selections to localStorage
  const saveConversationSelections = () => {
    try {
      const checkedBoxes = document.querySelectorAll(".gbd-chat-checkbox:checked");
      const selections = Array.from(checkedBoxes).map((cb) => {
        const item = cb.parentElement;
        return {
          index: cb.dataset.index,
          textContent: item ? item.textContent.trim().substring(0, 100) : "",
          position: Array.from(document.querySelectorAll(".gbd-chat-checkbox")).indexOf(cb)
        };
      });

      if (selections.length > 0) {
        localStorage.setItem("gbd_saved_selections", JSON.stringify(selections));
        localStorage.setItem("gbd_selections_timestamp", Date.now().toString());
        debugLog(`Saved ${selections.length} selections.`);
      }
    } catch (err) {
      debugWarn("Error saving conversation selections:", err);
    }
  };

  // Restore checkbox selections from localStorage
  const restoreConversationSelections = () => {
    try {
      const savedData = localStorage.getItem("gbd_saved_selections");
      const timestamp = localStorage.getItem("gbd_selections_timestamp");

      if (!savedData || !timestamp) return;

      // Discard saved selections if older than 2 minutes
      const maxAge = 120000;
      if (Date.now() - parseInt(timestamp, 10) > maxAge) {
        localStorage.removeItem("gbd_saved_selections");
        localStorage.removeItem("gbd_selections_timestamp");
        return;
      }

      const selections = JSON.parse(savedData);
      if (selections.length === 0) return;

      // Auto-enter multi-select mode if restoring
      if (!isMultiSelectActive) {
        enterMultiSelectMode();
      }

      setTimeout(() => {
        let restoredCount = 0;
        const checkboxes = document.querySelectorAll(".gbd-chat-checkbox");

        selections.forEach((sel) => {
          let targetCb = null;
          
          if (sel.index && checkboxes[sel.index]) {
            targetCb = checkboxes[sel.index];
          }
          if (!targetCb && sel.position < checkboxes.length) {
            targetCb = checkboxes[sel.position];
          }
          if (!targetCb && sel.textContent) {
            for (const cb of checkboxes) {
              const text = cb.parentElement?.textContent.trim().substring(0, 100) || "";
              if (text === sel.textContent) {
                targetCb = cb;
                break;
              }
            }
          }

          if (targetCb && !targetCb.checked) {
            targetCb.checked = true;
            restoredCount++;
          }
        });

        if (restoredCount > 0) {
          handleCheckboxChange();
          debugLog(`Restored ${restoredCount}/${selections.length} selections.`);
        }

        // Clean up saved selections keys
        localStorage.removeItem("gbd_saved_selections");
        localStorage.removeItem("gbd_selections_timestamp");
      }, 500);

    } catch (err) {
      debugWarn("Error restoring conversation selections:", err);
    }
  };

  // Hold/Long-press to trigger Selection Mode
  const handleLongPressStart = (e) => {
    // Only handle left click or touch start
    if (e.type === "mousedown" && e.button !== 0) return;
    if (isMultiSelectActive) return;

    const item = e.target.closest('gem-nav-list-item[data-test-id="conversation"]');
    if (!item) return;

    // Avoid long press triggering when clicking option menu buttons or checkboxes directly
    if (e.target.closest('[data-test-id="actions-menu-button"]') || 
        e.target.closest('.gem-conversation-actions-menu-button') ||
        e.target.closest('.gbd-chat-checkbox')) {
      return;
    }

    longPressTriggered = false;
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      blockNextClick = true;

      // Enter selection mode
      enterMultiSelectMode();

      // Check the checkbox of the hold-clicked item
      const cb = item.querySelector(".gbd-chat-checkbox");
      if (cb) {
        cb.checked = true;
        handleCheckboxChange();
      }

      // Add visual flash feedback
      item.classList.add("gbd-longpress-flash");
      setTimeout(() => item.classList.remove("gbd-longpress-flash"), 300);
    }, 600); // 600ms hold threshold
  };

  const handleLongPressEnd = (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  document.addEventListener("mousedown", handleLongPressStart, true);
  document.addEventListener("mouseup", handleLongPressEnd, true);
  document.addEventListener("mouseleave", handleLongPressEnd, true);

  document.addEventListener("touchstart", handleLongPressStart, { capture: true, passive: true });
  document.addEventListener("touchend", handleLongPressEnd, true);
  document.addEventListener("touchcancel", handleLongPressEnd, true);

  // Block the immediate click event if long-press was triggered
  document.addEventListener("click", (e) => {
    if (blockNextClick) {
      e.preventDefault();
      e.stopPropagation();
      blockNextClick = false;
      longPressTriggered = false;
    }
  }, true);

  // Initialize the extension interface
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      waitForHeader();
      startOverlayObserver();
      checkAndShowRatingPrompt();
    });
  } else {
    waitForHeader();
    startOverlayObserver();
    checkAndShowRatingPrompt();
  }

})();

