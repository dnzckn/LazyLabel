# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- YOLO text file export with user-defined aliases

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

- YOLO output format support
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
