// Deletion process loop for Gemini Bulk Delete Extension
(function () {
  "use strict";

  window.startDeletionProcess = async () => {
    const checkedBoxes = Array.from(document.querySelectorAll(".gbd-chat-checkbox:checked")).reverse();
    if (checkedBoxes.length === 0) return;

    const trashBtn = document.getElementById("gbd-trash-btn");
    const closeBtn = document.getElementById("gbd-close-btn");
    const container = document.querySelector(".gbd-controls-container");

    window.GbdState.isDeleting = true;
    window.GbdState.deletionAborted = false;

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
        if (window.GbdState.deletionAborted) {
          window.debugLog("Exiting deletion loop early because user aborted.");
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
          window.simulateClick(actionsBtn);

          // 2. Wait for the menu dropdown container
          const menuPanel = await window.waitForElement(['.mat-mdc-menu-panel', '[role="menu"]', '.cdk-overlay-pane'], document, 3000);
          if (!menuPanel) continue;
          if (window.GbdState.deletionAborted) break;

          // 3. Find and click the delete button in the menu panel
          const deleteSelectors = [
            'button[data-test-id="delete-button"]',
            'button[aria-label*="delete" i]',
            'button.delete-btn'
          ];
          const deleteBtn = await window.waitForElement(deleteSelectors, menuPanel, 3000, "delete");
          if (!deleteBtn) continue;
          if (window.GbdState.deletionAborted) break;
          window.simulateClick(deleteBtn);

          // 4. Wait for the confirmation dialog
          const dialogSelectors = [
            '.mat-mdc-dialog-container',
            'mat-dialog-container',
            '[role="dialog"]',
            '.modal-container'
          ];
          const dialogContainer = await window.waitForElement(dialogSelectors, document, 3000);
          if (!dialogContainer) continue;
          if (window.GbdState.deletionAborted) break;

          // 5. Find and click confirmation delete button in popup dialog
          const confirmSelectors = [
            'button[data-test-id="confirm-button"]',
            'button[aria-label*="confirm" i]',
            'button.confirm-btn'
          ];
          const confirmBtn = await window.waitForElement(confirmSelectors, dialogContainer, 3000, "confirm");
          if (!confirmBtn) continue;
          if (window.GbdState.deletionAborted) break;
          window.simulateClick(confirmBtn);

          // 6. Wait for the list item to be removed from the DOM tree
          let removed = false;
          for (let i = 0; i < 50; i++) {
            if (window.GbdState.deletionAborted) break;
            if (!document.body.contains(item) || item.offsetParent === null) {
              removed = true;
              break;
            }
            await window.delay(100);
          }
          if (!removed) {
            // If not removed from DOM, force close dialog in case it got stuck
            document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
            await window.delay(200);
          } else {
            current++;
          }
        } catch (err) {
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
          await window.delay(200);
        }

        // Wait 300ms before doing the next deletion
        await window.delay(300);
      }

      // Set final progress bar state
      if (container && !window.GbdState.deletionAborted) {
        const progressLabel = document.getElementById("gbd-progress-label");
        if (progressLabel) {
          progressLabel.textContent = `Delete ${total}/${total}`;
        }
        container.style.background = `linear-gradient(to right, rgba(var(--gbd-progress-rgb), 0.2) 100%, rgba(var(--gbd-progress-rgb), 0.05) 100%)`;
        await window.delay(150); // Small display delay for final state
      }
    } finally {
      if (window.GbdState.deletionAborted) {
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

      window.GbdState.isDeleting = false;
      window.GbdState.deletionAborted = false;

      if (closeBtn) {
        closeBtn.disabled = false;
        closeBtn.style.opacity = "";
      }

      window.exitMultiSelectMode();
    }
  };
})();
