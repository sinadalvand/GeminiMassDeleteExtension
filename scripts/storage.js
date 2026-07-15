// Storage helper class for Gemini Bulk Delete Extension
(function () {
  "use strict";

  window.GbdStorage = {
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
      const isDev = window.isDevMode();

      const defaultState = {
        gbd_use_count: 0,
        gbd_rating_dismissed_until: isDev ? 0 : 3,
        gbd_already_rated: false
      };
      const saved = await window.GbdStorage.get(Object.keys(defaultState));
      
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
      await window.GbdStorage.set({ gbd_rating_dismissed_until: currentUses + 15 });
    },

    markAsRated: async () => {
      await window.GbdStorage.set({ gbd_already_rated: true });
    }
  };

  window.isDevMode = () => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        return !manifest.update_url;
      }
    } catch (e) {}
    return true; // Fallback for local files/testing
  };
})();
