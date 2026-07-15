// Shared State Namespace for Gemini Bulk Delete Extension
(function () {
  "use strict";

  window.GbdState = {
    isMultiSelectActive: false,
    isDeleting: false,
    deletionAborted: false,
    lastClickedItemIndex: -1,
    activeConversationItem: null,
    longPressTimer: null,
    longPressTriggered: false,
    blockNextClick: false,
    chatObserver: null,
    headerObserver: null,
    overlayObserver: null
  };
})();
