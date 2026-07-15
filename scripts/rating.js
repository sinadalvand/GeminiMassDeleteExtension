// Rating Prompt UI module for Gemini Bulk Delete Extension
(function () {
  "use strict";

  window.findActivityControlItem = () => {
    const btn = document.querySelector('button[aria-label="Gemini Apps Activity"]') ||
                document.querySelector('[data-test-id="desktop-bard-activity-control"]') ||
                document.querySelector('gem-nav-list-item[title="Activity"]');
    if (btn) {
      return btn.closest('gem-nav-list-item') || btn;
    }
    return null;
  };

  window.checkAndShowRatingPrompt = async (currentCount = null, savedState = null) => {
    try {
      const state = savedState || await window.GbdStorage.getState();
      const count = currentCount !== null ? currentCount : state.gbd_use_count;
      
      if (state.gbd_already_rated) {
        const box = document.getElementById("gbd-rating-box");
        if (box) box.remove();
        return;
      }
      
      if (count >= state.gbd_rating_dismissed_until) {
        window.renderRatingPrompt(count);
      } else {
        const box = document.getElementById("gbd-rating-box");
        if (box) box.remove();
      }
    } catch (e) {
      window.debugWarn("Error showing rating prompt:", e);
    }
  };

  window.renderRatingPrompt = (currentCount) => {
    if (document.getElementById("gbd-rating-box")) {
      return;
    }

    const activityItem = window.findActivityControlItem();
    if (!activityItem) {
      // Retry in a bit if container not loaded yet
      setTimeout(() => window.renderRatingPrompt(currentCount), 1000);
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
      await window.GbdStorage.dismissPrompt(currentCount);
    });

    // Make the entire rating box clickable to redirect to reviews
    ratingBox.addEventListener("click", async (e) => {
      // Ignore clicks on the close button (handled by closeBtn listener)
      if (e.target.closest("#gbd-rating-close-btn")) {
        return;
      }
      
      e.stopPropagation();
      e.preventDefault();
      
      await window.GbdStorage.markAsRated();
      
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

  window.handleExtensionUsed = async () => {
    try {
      const state = await window.GbdStorage.getState();
      const newCount = state.gbd_use_count + 1;
      await window.GbdStorage.set({ gbd_use_count: newCount });
      window.debugLog(`Extension used ${newCount} times.`);
      window.checkAndShowRatingPrompt(newCount, state);
    } catch (e) {
      window.debugWarn("Error in handleExtensionUsed:", e);
    }
  };
})();
