// Entry point and initialization module for Gemini Bulk Delete Extension
(function () {
  "use strict";

  // Load stylesheet dynamically
  if (!document.getElementById("gbd-tokens-stylesheet")) {
    const link = document.createElement("link");
    link.id = "gbd-tokens-stylesheet";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("style/tokens.css");
    document.head.appendChild(link);
    window.debugLog("Stylesheet injected.");
  }

  // Monitor DOM overlays for Material options menus
  window.startOverlayObserver = () => {
    if (window.GbdState.overlayObserver) return;

    window.GbdState.overlayObserver = new MutationObserver(() => {
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
      window.updateArrowVisibility();
    });

    window.GbdState.overlayObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    window.debugLog("Overlay observer started.");
  };

  window.stopOverlayObserver = () => {
    if (window.GbdState.overlayObserver) {
      window.GbdState.overlayObserver.disconnect();
      window.GbdState.overlayObserver = null;
    }
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
    const activeItem = window.getActiveConversationItem();
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

      const activeItem = window.getActiveConversationItem();

      // Dismiss options dropdown menu
      const backdrop = document.querySelector(".cdk-overlay-backdrop");
      if (backdrop) {
        backdrop.click();
      }

      if (activeItem) {
        const cb = activeItem.querySelector(".gbd-chat-checkbox");
        let nextChecked = true;

        if (!window.GbdState.isMultiSelectActive) {
          window.enterMultiSelectMode();
          const newCb = activeItem.querySelector(".gbd-chat-checkbox");
          if (newCb) {
            newCb.checked = true;
            nextChecked = true;
            window.handleCheckboxChange();
          }
        } else {
          if (cb) {
            cb.checked = !cb.checked;
            nextChecked = cb.checked;
            window.handleCheckboxChange();
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
    window.debugLog("Select menu item injected under Delete.");
  };

  // Wait for the Recents button block
  window.waitForHeader = () => {
    const selector = 'button[data-test-id="expandable-section-toggle"][aria-controls="sidenav-section-content-chats"]';
    
    const headerBtn = document.querySelector(selector);
    if (headerBtn) {
      window.injectControls(headerBtn);
      return;
    }

    if (window.GbdState.headerObserver) window.GbdState.headerObserver.disconnect();

    window.GbdState.headerObserver = new MutationObserver((mutations, observer) => {
      const btn = document.querySelector(selector);
      if (btn) {
        window.injectControls(btn);
        observer.disconnect();
      }
    });

    window.GbdState.headerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  // Save current checkbox selections to localStorage
  window.saveConversationSelections = () => {
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
        window.debugLog(`Saved ${selections.length} selections.`);
      }
    } catch (err) {
      window.debugWarn("Error saving conversation selections:", err);
    }
  };

  // Restore checkbox selections from localStorage
  window.restoreConversationSelections = () => {
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
      if (!window.GbdState.isMultiSelectActive) {
        window.enterMultiSelectMode();
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
          window.handleCheckboxChange();
          window.debugLog(`Restored ${restoredCount}/${selections.length} selections.`);
        }

        // Clean up saved selections keys
        localStorage.removeItem("gbd_saved_selections");
        localStorage.removeItem("gbd_selections_timestamp");
      }, 500);

    } catch (err) {
      window.debugWarn("Error restoring conversation selections:", err);
    }
  };

  // Event Listeners registration
  document.addEventListener("mousedown", window.trackActiveItem, true);
  document.addEventListener("click", window.trackActiveItem, true);

  document.addEventListener("mousedown", window.handleLongPressStart, true);
  document.addEventListener("mouseup", window.handleLongPressEnd, true);
  document.addEventListener("mouseleave", window.handleLongPressEnd, true);

  document.addEventListener("touchstart", window.handleLongPressStart, { capture: true, passive: true });
  document.addEventListener("touchend", window.handleLongPressEnd, true);
  document.addEventListener("touchcancel", window.handleLongPressEnd, true);

  // Block the immediate click event if long-press was triggered
  document.addEventListener("click", (e) => {
    if (window.GbdState.blockNextClick) {
      e.preventDefault();
      e.stopPropagation();
      window.GbdState.blockNextClick = false;
      window.GbdState.longPressTriggered = false;
    }
  }, true);

  // Handle capturing clicks for range selection
  document.addEventListener("click", window.handleConversationClick, true);

  // Initialize the extension interface
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.waitForHeader();
      window.startOverlayObserver();
      window.checkAndShowRatingPrompt();
    });
  } else {
    window.waitForHeader();
    window.startOverlayObserver();
    window.checkAndShowRatingPrompt();
  }
})();
