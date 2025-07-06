# Mouse-over Highlighting Debug Guide

## Issue
Mouse-over highlighting is not working in LazyLabel multi-view mode. When users hover over segments, they don't highlight.

## Debug Changes Made

### 1. Added Debug Logging
- Added extensive debug logging to `_trigger_segment_hover` method in `main_window.py`
- Added debug logging to `hoverEnterEvent` and `hoverLeaveEvent` in both `HoverablePolygonItem` and `HoverablePixmapItem`
- Added debug logging when creating hoverable items in `MultiViewModeHandler`

### 2. Fixed Potential Recursion Issue
- Modified `_trigger_segment_hover` to accept a `triggering_item` parameter
- Added logic to skip the triggering item when applying hover states to avoid recursion
- Updated hoverable items to pass themselves as the triggering item

## How to Debug

### Step 1: Enable Debug Logging
Run LazyLabel with debug logging enabled:
```bash
cd /home/deniz/python_projects/GitHub/LazyLabel
python debug_hover.py
python -m lazylabel.main
```

### Step 2: Test Multi-View Mode
1. Open LazyLabel
2. Switch to multi-view mode 
3. Load some images
4. Create some segments (using polygon or AI mode)
5. Try hovering over the segments

### Step 3: Check Debug Output
Look for these debug messages in the console:

**When segments are created:**
```
Created HoverablePolygonItem for segment X in viewer Y
Created HoverablePixmapItem for segment X in viewer Y
```

**When hovering over segments:**
```
HoverablePolygonItem.hoverEnterEvent: segment_id=X, main_window=True
Triggering segment hover: segment_id=X, view_mode=multi
_trigger_segment_hover called: segment_id=X, hover_state=True, view_mode=multi
multi_view_segment_items exists: [0, 1]
Viewer 0 has segments: [X, Y, Z]
Found segment X in viewer 0 with N items
Using setBrush for HoverablePolygonItem <object>
```

## Possible Issues to Look For

### 1. Hover Events Not Triggered
If you don't see `hoverEnterEvent` messages:
- The hoverable items might not be configured to accept hover events
- The mouse events might be blocked by other UI elements
- The graphics scene might not be set up correctly

### 2. segment_id Issues
If you see `segment_id=None` in the debug output:
- The `set_segment_info` method might not be called properly
- There might be an issue with how segments are indexed

### 3. multi_view_segment_items Structure Issues
If you see "Segment X not found in viewer Y":
- The data structure might not be initialized correctly
- Segments might not be added to the tracking dictionary properly
- There might be a mismatch between segment indices

### 4. View Mode Issues
If you see "Not in multi-view mode, returning":
- The `view_mode` attribute might not be set to "multi"
- The view mode detection logic might be incorrect

## Potential Root Causes

Based on the code analysis, here are the most likely issues:

1. **Hoverable Items Not Created**: The most likely issue is that hoverable items are not being created properly or their hover events are not being triggered.

2. **Data Structure Issues**: The `multi_view_segment_items` dictionary might not be populated correctly when segments are displayed.

3. **View Mode Detection**: The hover logic only works in multi-view mode, so if the view mode is not detected correctly, hover won't work.

4. **Coordinate/Scene Issues**: The hover events might not be reaching the items due to scene setup or coordinate system issues.

## Next Steps

1. Run the debug version and check the console output
2. Based on the debug output, identify which part of the hover chain is failing
3. Fix the specific issue found (e.g., missing segment_id, incorrect data structure, etc.)
4. Test the fix and verify hover functionality works
5. Remove debug logging once the issue is resolved