// Utility helpers for Gemini Bulk Delete Extension
(function () {
  "use strict";

  window.debugLog = (...args) => {
    // console.log("[GBD Injector]", ...args);
  };

  window.debugWarn = (...args) => {
    // console.warn("[GBD Injector Warning]", ...args);
  };

  window.safeGetMessage = (messageName, substitutions = null, fallback = "") => {
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

  // Helper to query element from selectors list
  window.querySelectors = (selectors, parent = document) => {
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
  window.findButtonByText = (terms, parent = document) => {
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
  window.waitForElement = (selectors, parent = document, timeout = 5000, type = "") => {
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

  window.delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Simulate standard mouse click flow (hover/pointer interaction sequence)
  window.simulateClick = (el) => {
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
})();
