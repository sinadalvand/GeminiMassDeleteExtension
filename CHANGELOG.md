# Changelog

All notable changes to **Gemini Mass Delete Extension** are documented in this file.

## [1.2.2] - 2026-11-16

### Fixed
- **Delete button not appearing after selecting chats.** Gemini's latest sidebar update removed the `data-test-id="expandable-section-toggle"` attribute from the chats section header (now titled "All"), so the extension could no longer find the place where it puts the trash, cancel and select-all controls. The header is now located using a list of selectors that falls back to the stable `aria-controls="sidenav-section-content-chats"` link.
- **Controls disappearing after the sidebar re-renders.** The extension now keeps watching the chats header and puts the controls back automatically (with the correct selection state) whenever Gemini redraws it.
- **Duplicate deletion runs.** Triggering deletion twice (e.g. double-clicking the trash button) can no longer start two deletion loops at the same time.

### Added
- **Keyboard shortcut to delete selected chats.** Press the **Delete** key while chats are selected to start deleting them. Works with `delete` / `⌫` on Mac and with `Delete` or `Backspace` on Windows/Linux. Holding the key down, pressing it during an active deletion, or typing in a text field never triggers it.
