# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.2] - 2026-03-10

### Fixed

- Undo spam in sequence mode creating phantom classes: undo/redo history is now cleared on frame switch, preventing stale actions from re-adding segments from other frames

### Added

- Regression test for sequence frame switch clearing undo history

## [1.7.1] - 2026-03-09

### Fixed

- Vertex dragging broken in sequence mode: mouse event handlers now route to the correct viewer's original scene handler based on active view mode
- Undo past empty state creating phantom classes: added bounds validation for segment index before undo execution, with proper cleanup of redo history on failure

### Added

- 10 unit tests covering both bugfixes (undo bounds validation, mouse handler routing)

## [1.7.0] - 2026-03-07

### Added

- Pluggable export framework with 6 annotation formats: NPZ, YOLO Detection, YOLO Segmentation, COCO JSON, Pascal VOC, and CreateML
- All formats round-trip: export and load back with pixel-identical masks
- Multi-select format dropdown in Settings replaces old save checkboxes
- File manager columns for all 6 format types with checkmark indicators
- COCO JSON supercategory support via dot notation in class aliases (e.g. `dog.animal`)
- NPZ files now store class aliases and class order for lossless ID preservation
- YOLO formats use standard integer class IDs

### Changed

- Settings: `export_formats` list replaces `save_npz`, `save_txt`, `bb_use_alias`, `save_class_aliases` booleans (auto-migrated)
- Fallback load chain: NPZ > YOLO Seg > COCO JSON > Pascal VOC > CreateML > YOLO Det

### Removed

- Per-image `.json` class alias sidecar files (aliases now embedded in NPZ)
- Sequence memory load UI (unused feature)

## [1.6.21] - 2026-03-06

### Fixed

- tqdm crash in PyInstaller .exe builds: redirect `sys.stdout`/`sys.stderr` to `os.devnull` when `None` (console=False)

## [1.6.20] - 2026-03-06

### Fixed

- Video predictor init validates config paths before Hydra init for clearer errors in .exe builds
- Checkpoint loading uses `strict=False` matching the image predictor approach that works in .exe
- Actual error messages now surface in UI notification instead of generic failure text
- atexit handler ensures temp directories are cleaned up even on crash

## [1.6.19] - 2026-03-06

### Fixed

- Frames with empty masks (no positive pixels) no longer marked as propagated (green)
- Below-threshold confidence frames are always flagged (red), never shown as propagated (green)

## [1.6.18] - 2026-03-06

### Fixed

- Video predictor initialization hanging in PyInstaller .exe builds (use manual Hydra config dir instead of module-based resolution)
- Status bar always showing "Default SAM Model" instead of the actual loaded model name
- Added `sam2.sam2_video_predictor` to PyInstaller hidden imports
- Added full tracebacks to video predictor/state error logging for easier debugging

## [1.6.17] - 2026-03-06

### Added

- Keep Range button (green) - keeps only frames between trim markers, removes everything outside
- Cut button (brown, renamed from Trim Range) - removes frames between trim markers
- 6 new unit tests for Cut and Keep operations including complement proof

## [1.6.16] - 2026-03-06

### Added

- Comprehensive sequence mode tests: 29 trim/sort unit tests + 21 integration tests covering full workflow
- Thread safety locks on SequenceViewMode state for safe concurrent access during propagation
- Object class mapping (`_obj_class_map`) persists through trim and serialization - masks keep correct classes after trim
- Clear Flags button on timeline to reset all status colors
- Skip Labeled checkbox defaults to checked - propagation won't overwrite already-labeled frames

### Fixed

- Trim now always respects the current timeline display order (sorted or unsorted)
- Propagation colors update accurately in real-time instead of correcting after completion
- Fixed deferred frame coloring so multi-object frames don't flash green→red
- Fixed masks losing class identity after trim (all becoming Class 0)
- Fixed RecursionError on fast timeline scrubbing with re-entrancy guard
- Fixed slow image loading from file navigator in sequence mode (deferred SAM embedding)
- Fixed sort not persisting after trim
- Zoom +/- buttons no longer shift position - disabled instead of hidden

### Changed

- Purged all YOLO references - terminology is now "bounding box" throughout
- Renamed `yolo_use_alias` setting to `bb_use_alias`
- Improved tooltips for Skip Low Conf, Skip Labeled, and Min Conf controls
- Better error messages: propagation init failure, dimension mismatches, 0 frames propagated
- README `.txt` format description corrected to bounding boxes with coordinate explanation

## [1.6.15] - 2026-03-05

### Fixed

- PyInstaller: add `hydra` and `omegaconf` hidden imports and data files. SAM2 requires these for its config system but PyInstaller doesn't detect them

## [1.6.14] - 2026-03-05

### Fixed

- Pin PyQt6 to `>=6.7.1,<6.10` - PyQt6 6.10.x has DLL incompatibilities with PyInstaller on Windows
- Revert unnecessary spec changes (runtime hook, dynamic lib collection, UPX excludes) that were masking the PyQt6 version issue

## [1.6.13] - 2026-03-05

### Fixed

- PyInstaller: exclude Qt/Python DLLs from UPX compression. UPX corrupts Qt DLLs causing "specified procedure could not be found" on Windows

## [1.6.12] - 2026-03-05

### Fixed

- PyInstaller: add Qt runtime hook to set `QT_PLUGIN_PATH` and DLL search path on Windows
- PyInstaller: collect PyQt6 dynamic libraries (`collect_dynamic_libs`) to bundle all Qt DLLs
- Fixes "specified procedure could not be found" DLL load error for QtWidgets on Windows

## [1.6.11] - 2026-03-05

### Fixed

- Fix `ValueError: too many values to unpack` when undoing segment deletion - highlight cache key was missing `viewer_idx` in `shift_cache_after_deletion`

## [1.6.10] - 2026-03-05

### Fixed

- Graceful fallback when `qdarktheme` fails to load (e.g. DLL incompatibility with newer PyQt6 on Windows). App launches with default Qt style instead of crashing

## [1.6.9] - 2026-03-05

### Fixed

- PyInstaller spec: add `PyQt6.QtSvg` and `darkdetect` hidden imports to fix DLL load failure on Windows (qdarktheme requires both for SVG icons and system theme detection)

## [1.6.8] - 2026-03-05

### Added

- Timeline sort button: groups done frames left, needs-work frames right
- Skip-labeled checkbox: propagation preserves existing NPZ files
- Abort button: Propagate button becomes red Abort during propagation with progress display
- Frame separator lines on timeline when zoomed in (≥4px per frame)
- Histogram grid lines and dynamic view range
- Red trim markers on timeline for trim bounds
- Virtual-scroll timeline replacing QScrollArea for better performance

### Fixed

- Timeline scrubbing: QScrollArea was eating mouse events, now forwarded via event filter
- Reference annotation progress reports per-image instead of per-segment
- File manager NPZ column sorting (wrong column_map indices)
- QThread crashes: use `deleteLater()` in all worker finished handlers
- Fix `AttributeError: 'MainWindow' has no attribute 'sam_single_view_manager'` when loading model

## [1.6.7] - 2026-03-05

### Fixed

- Fix `AttributeError: 'MainWindow' has no attribute 'sam_single_view_manager'` when loading model - use correct `sam_worker_manager` attribute

## [1.6.6] - 2026-03-04

### Fixed

- Fix QThread cleanup segfault in propagation worker Qt tests by adding `worker.wait()` after signal completion

## [1.6.5] - 2026-03-03

### Added

- **Bounding box TXT loading fallback**: `load_existing_mask()` now falls back to loading bounding box TXT labels when no NPZ file exists
- **`load_bb_txt()`** method in FileManager for parsing bounding box TXT label files
- **Crop-aware FFT thresholding**: FFT now operates only on the crop region when a crop is active, keeping outside pixels unchanged. Prevents metadata bars, scale bars, and timestamps from corrupting frequency domain analysis
- **16-bit image support**: Image caching, channel thresholding, and FFT pipeline now preserve 16-bit depth via `cv2.IMREAD_UNCHANGED`, with proper uint16→uint8 conversion at display/SAM boundaries

### Changed

- Renamed save functions to `save_bb_txt` for clarity
- Channel threshold sliders now support 0–65536 range for 16-bit images
- `cache_original_image()` uses `cv2.IMREAD_UNCHANGED` instead of QPixmap for robust format handling

### Fixed

- PyInstaller spec updated to use `qdarktheme` instead of `pyqtdarktheme` for theme data collection and hidden imports
- `_version.py` updated to match current release version
- README license badge switched to PyPI-sourced badge for reliability
- Ruff formatting fixes across multiple files

## [1.6.4] - 2026-02-20

### Added

- **"Add All Labeled" button**: Adds all frames with existing NPZ labels as reference frames in one click
- **Trim Range feature**: Remove frames from the timeline by setting left/right bounds and trimming. Timeline-only, files on disk are not affected
- Trim section in sequence widget with Set Left/Right, Clear Trim, and Trim Range controls

### Changed

- Skipped frame color changed from bright yellow to brown in the timeline for better visual distinction
- "New Timeline" button styled with brown color to signal destructive action
- QGroupBox sections in sequence widget now have consistent border/title styling and tighter margins
- Reference buttons row 2 now shows "+ All Labeled" alongside "Clear All"

## [1.6.3] - 2026-02-19

### Fixed

- **Sequence Mode Dimension Mismatch**: Images with different dimensions in a sequence no longer produce stretched/incorrect masks during SAM2 propagation
- Reference frames now enforce consistent dimensions - mismatches are rejected with a notification showing expected vs actual size
- Images with mismatched dimensions are automatically filtered out before loading into SAM2's video predictor
- Skipped frames are colored yellow in the timeline so users can see why they were excluded
- SAM2-to-timeline index mapping maintains correct frame indices after filtering
- Ruff formatting in `sam2_model.py`

### Added

- `SKIPPED` frame status for dimension-mismatched frames, preserved across propagation resets

## [1.6.2] - 2026-02-18

### Added

- **Sequence Init Progress**: Progress callbacks during sequence initialization for real-time UI updates
- **Reference Annotation Worker**: Background `ReferenceAnnotationWorker` to offload adding reference annotations to SAM2, preventing UI freezes
- **Sequence Init Worker**: Background `SequenceInitWorker` to run sequence initialization off the GUI thread

### Changed

- Sequence initialization uses explicit image path lists instead of directory scanning
- Sequence init, reference annotation, and propagation all run on background threads to keep the UI responsive
- Cancellation now covers init, annotation, and propagation stages
- Previous propagation state is cleaned up when building a new timeline

### Fixed

- UI freezing during sequence initialization and reference annotation processing

## [1.6.1] - 2026-01-01

### Added

- **Confidence Display**: Show confidence score in sequence mode info label (e.g., "Conf: 0.9923")
- **New Timeline Button**: Rebuild timeline after already having one built
- **Start/End Frame Colors**: Distinct highlighting colors (light green for start, red for end)

### Fixed

- Min confidence threshold not re-applied after timeline rebuild
- Flagged frames incorrectly saved by "Save All" operation
- File navigator highlighting interrupted by alternating row colors
- SAM2 failing with non-numeric filenames (now uses symlinks transparently)

### Changed

- Default confidence threshold changed to 0.99 with 4 decimal precision

## [1.6.0] - 2025-12-31

### Added

- **Sequence Mode**: Complete workflow for propagating masks across image sequences using SAM 2's video predictor
  - `SequenceViewMode` - State management for reference frames, propagation status, and frame navigation
  - `PropagationManager` - SAM 2 video predictor integration with multi-reference support
  - `PropagationWorker` - Background thread for non-blocking propagation operations
  - `TimelineWidget` - Visual frame navigation with status-colored indicators (reference, propagated, flagged, pending)
  - `SequenceWidget` - Control panel for reference management, propagation settings, and review navigation
- **Multi-Reference Propagation**: Add multiple reference frames for improved propagation quality
  - "Add Current" button to mark current frame as reference
  - "Add All Before" button to batch-add all preceding frames as references
  - Visual similarity-based attention (not just temporal proximity)
- **Confidence-Based Flagging**: Automatic detection of low-quality predictions
  - Tunable confidence threshold (0.0-1.0, default 0.95)
  - Auto-flagging of frames below threshold for manual review
  - "Skip Low Conf" option to exclude flagged frames from propagation
- **Review Navigation**: Efficient workflow for reviewing flagged frames
  - Next/Previous flagged frame navigation (N / Shift+N)
  - Flagged frame counter in sequence widget
- **Propagation Range Control**: Specify start and end frames for targeted propagation
- **Memory Preloading**: Optional preloading of sequence images for fast navigation
- **Bidirectional Propagation**: Propagate from all reference frames in both directions simultaneously

### Changed

- SAM 2 model now supports video predictor mode for sequence operations
- Segment manager supports merging segments by class for consistent mask handling

## [1.5.0] - 2025-12-28

### Added

- **MVVM Architecture**: Introduced `SingleViewViewModel` and `MultiViewViewModel` for reactive state management
- **Dependency Injection**: Added `AppContext`, `UIContext`, and `FullContext` containers
- **Manager Pattern**: Extracted 25+ specialized managers from `main_window.py`:
  - `DrawingStateManager` - Centralized drawing state (SAM points, polygons, bboxes)
  - `MultiViewStateManager` - Per-viewer state management
  - `ModeManager` - Mode switching and cursor management
  - `SegmentDisplayManager` - LRU caching for segment pixmaps
  - `MultiViewDisplayManager` - Multi-view segment rendering
  - `SAMWorkerManager`, `SAMSingleViewManager`, `SAMMultiViewManager` - SAM operations
  - `AISegmentManager` - AI segment acceptance and tracking
  - `KeyboardEventManager` - Keyboard event dispatch
  - `EditModeManager` - Polygon vertex editing
  - `PolygonDrawingManager` - Polygon creation and editing
  - `ViewportManager` - Zoom, pan, and fit operations
  - `FileNavigationManager` - File browser operations
  - `SaveExportManager` - Save and export operations
  - `SegmentTableManager` - Segment table UI management
  - `ImageAdjustmentManager` - Brightness, contrast, gamma controls
  - `CoordinateTransformer` - Display to SAM coordinate conversion
  - `EmbeddingCacheManager` - SAM embedding LRU cache
  - `NotificationManager` - Status bar notifications
  - `UILayoutManager` - Multi-view layout creation
- **Handler Pattern**: `SingleViewMouseHandler`, `MultiViewMouseHandler`
- **Mode Pattern**: `BaseModeHandler`, `SingleViewModeHandler`, `MultiViewModeHandler`
- Comprehensive type hints across all manager property accessors
- Unit tests for `SingleViewMouseHandler` edit mode drag operations
- `getConsecutiveFile()` method to `FastFileManager` for sorted file navigation
- Comprehensive unit tests for NPZ format compatibility (7 tests)
- Unit tests for keyboard event handling (8 tests)
- Unit tests for multi-view selection sync (6 tests)
- Unit tests for segment independence between viewers (4 tests)

### Changed

- Complete rewrite of `ARCHITECTURE.md` reflecting new MVVM structure
- Consolidated multi-view state management into dedicated managers
- DRY refactoring of SAM property accessors

### Fixed

- Missing setter for `drag_initial_vertices` property
- 4-view viewmodel synchronization
- `cv2.drawContours` argument in fragment threshold
- Import ordering for ruff compliance
- NPZ cross-mode incompatibility: standardized on "mask" key for single-view and multi-view compatibility
- Escape key not clearing selections in multi-view mode
- Multi-view selection sync only selecting one row instead of all selected rows
- Shared vertices reference causing segment edits to affect both viewers
- Multi-view file loading ignoring current sort order of file list
- pytest abort on exit due to QThread cleanup issues in tests

## [1.4.3] - 2025-12-26

### Added

- Auto-convert AI segments to polygon toggle for immediate editability
- SAM embedding preloading for next image

### Changed

- Comprehensive UI performance optimizations

### Fixed

- SAM2 features dict handling in embedding cache
- Segment display and AI model coordinate issues

## [1.4.2] - 2025-12-24

### Fixed

- Minor stability improvements

## [1.4.1] - 2025-12-22

### Added

- Segment display caching for improved performance
- Version display in Windows executable title bar
- Build documentation for Windows executables

### Fixed

- PyInstaller bundle path handling for SAM model loading
- Relative imports converted to absolute for PyInstaller compatibility
- Icon format and setuptools conflict in PyInstaller spec
- NSIS installer path issues
- NumPy randint ValueError in auto-save test

## [1.4.0] - 2025-11-27

### Added

- Windows executable build system with PyInstaller
- NSIS installer for professional Windows distribution

### Changed

- Organized build files into `build_system/` directory

## [1.3.11] - 2025-10-11

### Added

- Smooth slider updates with throttling

## [1.3.10] - 2025-10-11

### Added

- Persistent settings with reset to default button

## [1.3.9] - 2025-09-09

### Added

- Pixel priority setting for exclusive class ownership
- Hotkey `Z` to toggle AI filter between 0 and last value
- Hotkey `X` for toggling recent class
- Shift modifier eraser functionality

## [1.3.8] - 2025-08-16

### Added

- Parallel multi-view image loading for faster workflows

## [1.3.7] - 2025-08-01

### Added

- Functional multi-view unlink feature

### Changed

- Documentation improvements for keyboard shortcuts and workflows

## [1.3.6] - 2025-07-29

### Added

- Comprehensive segment management section in usage manual
- Updated GUI screenshot

### Changed

- Professional documentation tone
- Channel threshold slider performance optimization

## [1.3.5] - 2025-07-29

### Changed

- Major main_window.py refactoring for maintainability
- GUI aesthetics improvements

## [1.3.4] - 2025-07-27

### Fixed

- Channel threshold bug fix

## [1.3.3] - 2025-07-26

### Fixed

- Speed optimization fixes

## [1.3.2] - 2025-07-26

### Added

- File navigation speed improvements

## [1.3.1] - 2025-07-14

### Fixed

- Lazy loading of models

## [1.3.0] - 2025-07-13

### Added

- Multi-view mode for simultaneous image annotation
- Citation file (CITATION.cff)

## [1.2.2] - 2025-07-05

### Fixed

- Multi-view mode segment display issues
- Segment handling on model swap

## [1.2.1] - 2025-07-03

### Added

- SAM2 model support
- AI bounding box mode

### Changed

- Updated dependencies

## [1.2.0] - 2025-07-01

### Added

- FFT thresholding widget with UI and tests
- Channel thresholding for color-based segmentation

### Changed

- New UX design

## [1.1.9] - 2025-06-28

### Added

- Bounding box drawing tool with tests
- Brightness, contrast, gamma (BCG) controls
- Mock model for faster pytest execution

## [1.1.8] - 2025-06-28

### Added

- Additional test coverage

## [1.1.7] - 2025-06-28

### Changed

- Linting improvements

## [1.1.6] - 2025-06-26

### Changed

- Code quality improvements

## [1.1.5] - 2025-06-26

### Added

- GitHub Actions CI workflow

## [1.1.4] - 2025-06-26

### Added

- Undo/redo feature
- Testing infrastructure

## [1.1.3] - 2025-06-26

### Fixed

- Undo action bugs
- Join distance calculation

## [1.1.2] - 2025-06-26

### Added

- Detailed startup progress logging

## [1.1.1] - 2025-06-25

### Added

- Pop-out and collapsible panels
- Active class toggle
- Status bar

## [1.1.0] - 2025-06-25

### Added

- Customizable hotkey system with persistence
- Configuration module (settings, paths, hotkeys)

### Changed

- Major architecture refactor with modular structure

## [1.0.9] - 2025-06-18

### Added

- Bounding box text file export with user-defined aliases

### Fixed

- Freeze-ups on large folders

## [1.0.8] - 2025-06-16

### Fixed

- Hotkeys now work regardless of focus

## [1.0.7] - 2025-06-16

### Added

- Alias saving
- Adjustable menu sizes
- Tunable settings

## [1.0.6] - 2025-06-16

### Added

- Bounding box output format support
- TIFF image format support
- Adjustable annotation sizes

## [1.0.5] - 2025-06-16

### Changed

- Improved alpha and nearest pixel threshold
- Enhanced undo functionality

## [1.0.4] - 2025-06-15

### Added

- Pan mode toggle

### Changed

- Improved color algorithm for class visualization

## [1.0.3] - 2025-06-15

### Changed

- Improved selection functionality

## [1.0.2] - 2025-06-14

### Changed

- Minor improvements

## [1.0.1] - 2025-06-14

### Changed

- Project restructuring

## [1.0.0] - 2025-06-13

### Added

- Initial release
- AI-powered segmentation using Meta's Segment Anything Model (SAM)
- Single-click object segmentation
- Interactive refinement with positive/negative points
- Polygon drawing mode
- NPZ format export for semantic segmentation
- Class management with aliases
- Dark theme UI with PyQt6
- Image centering on load
- Multi-class reindexing via drag and drop

[1.7.2]: https://github.com/dnzckn/LazyLabel/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/dnzckn/LazyLabel/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/dnzckn/LazyLabel/compare/v1.6.21...v1.7.0
[1.6.21]: https://github.com/dnzckn/LazyLabel/compare/v1.6.20...v1.6.21
[1.6.20]: https://github.com/dnzckn/LazyLabel/compare/v1.6.19...v1.6.20
[1.6.19]: https://github.com/dnzckn/LazyLabel/compare/v1.6.18...v1.6.19
[1.6.18]: https://github.com/dnzckn/LazyLabel/compare/v1.6.17...v1.6.18
[1.6.17]: https://github.com/dnzckn/LazyLabel/compare/v1.6.16...v1.6.17
[1.6.16]: https://github.com/dnzckn/LazyLabel/compare/v1.6.15...v1.6.16
[1.6.15]: https://github.com/dnzckn/LazyLabel/compare/v1.6.14...v1.6.15
[1.6.14]: https://github.com/dnzckn/LazyLabel/compare/v1.6.13...v1.6.14
[1.6.13]: https://github.com/dnzckn/LazyLabel/compare/v1.6.12...v1.6.13
[1.6.12]: https://github.com/dnzckn/LazyLabel/compare/v1.6.11...v1.6.12
[1.6.11]: https://github.com/dnzckn/LazyLabel/compare/v1.6.10...v1.6.11
[1.6.10]: https://github.com/dnzckn/LazyLabel/compare/v1.6.9...v1.6.10
[1.6.9]: https://github.com/dnzckn/LazyLabel/compare/v1.6.8...v1.6.9
[1.6.8]: https://github.com/dnzckn/LazyLabel/compare/v1.6.7...v1.6.8
[1.6.7]: https://github.com/dnzckn/LazyLabel/compare/v1.6.6...v1.6.7
[1.6.6]: https://github.com/dnzckn/LazyLabel/compare/v1.6.5...v1.6.6
[1.6.5]: https://github.com/dnzckn/LazyLabel/compare/v1.6.4...v1.6.5
[1.6.4]: https://github.com/dnzckn/LazyLabel/compare/v1.6.3...v1.6.4
[1.6.3]: https://github.com/dnzckn/LazyLabel/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/dnzckn/LazyLabel/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/dnzckn/LazyLabel/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/dnzckn/LazyLabel/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/dnzckn/LazyLabel/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/dnzckn/LazyLabel/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/dnzckn/LazyLabel/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/dnzckn/LazyLabel/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/dnzckn/LazyLabel/compare/v1.3.11...v1.4.0
[1.3.11]: https://github.com/dnzckn/LazyLabel/compare/v1.3.10...v1.3.11
[1.3.10]: https://github.com/dnzckn/LazyLabel/compare/v1.3.9...v1.3.10
[1.3.9]: https://github.com/dnzckn/LazyLabel/compare/v1.3.8...v1.3.9
[1.3.8]: https://github.com/dnzckn/LazyLabel/compare/v1.3.7...v1.3.8
[1.3.7]: https://github.com/dnzckn/LazyLabel/compare/v1.3.6...v1.3.7
[1.3.6]: https://github.com/dnzckn/LazyLabel/compare/v1.3.5...v1.3.6
[1.3.5]: https://github.com/dnzckn/LazyLabel/compare/v1.3.4...v1.3.5
[1.3.4]: https://github.com/dnzckn/LazyLabel/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/dnzckn/LazyLabel/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/dnzckn/LazyLabel/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/dnzckn/LazyLabel/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/dnzckn/LazyLabel/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/dnzckn/LazyLabel/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/dnzckn/LazyLabel/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/dnzckn/LazyLabel/compare/v1.1.9...v1.2.0
[1.1.9]: https://github.com/dnzckn/LazyLabel/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/dnzckn/LazyLabel/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/dnzckn/LazyLabel/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/dnzckn/LazyLabel/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/dnzckn/LazyLabel/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/dnzckn/LazyLabel/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/dnzckn/LazyLabel/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/dnzckn/LazyLabel/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/dnzckn/LazyLabel/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/dnzckn/LazyLabel/compare/v1.0.9...v1.1.0
[1.0.9]: https://github.com/dnzckn/LazyLabel/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/dnzckn/LazyLabel/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/dnzckn/LazyLabel/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/dnzckn/LazyLabel/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/dnzckn/LazyLabel/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/dnzckn/LazyLabel/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/dnzckn/LazyLabel/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/dnzckn/LazyLabel/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/dnzckn/LazyLabel/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/dnzckn/LazyLabel/releases/tag/v1.0.0
