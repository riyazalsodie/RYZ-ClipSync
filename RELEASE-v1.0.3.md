# RYZ ClipSync v1.0.3

feat: add image clipboard capture, 10,000 item capacity, lazy loading, and pagination

- **Image Clipboard Support**: Implemented system clipboard monitoring for images (`clipboard.readImage()`) alongside text. Images are hashed using MD5 to avoid duplicates and saved in high resolution to `userData/images/`.
- **Image Previews & Badges**: Added visual image cards to the UI with dimension badges, transparency grid preview wrappers, and hover effects.
- **Copy Image Back to Clipboard**: Added IPC handler and frontend actions (double-click, tap, tray copy) to write images directly back to the OS clipboard.
- **Increased History Capacity**: Expanded maximum stored clipboard items from 500 to 10,000 items with asynchronous debounced persistence.
- **Pagination**: Implemented desktop-grade pagination controls (First, Previous, Page Input/Indicator, Next, Last) rendering 50 items per page to guarantee zero UI lag and 60+ FPS responsiveness.
- **Lazy Loading**: Added smooth infinite scroll lazy loading on scroll that dynamically loads subsequent 50-item chunks while keeping DOM footprint minimal.
- **Optimized Search**: Updated search filtering to instantly search across all 10,000 items in memory with real-time matching and automatic page reset.
- **Image File Cleanup**: Implemented automatic disk cleanup of orphaned image files when individual items are deleted or when clearing all history.
- **System Tray Support for Images**: Added image clip previews and image copy capabilities to the tray popup and "Copy Latest Item" action.
- **Version Bump**: Bumped version to 1.0.3 in `package.json`.
