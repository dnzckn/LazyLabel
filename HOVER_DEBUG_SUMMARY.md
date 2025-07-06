# Mouse-over Highlighting Debug Summary

## Problem Statement
Mouse-over highlighting is not working in LazyLabel multi-view mode. When users hover over segments, they don't highlight as expected.

## Code Analysis

### Current Implementation
1. **HoverablePolygonItem** and **HoverablePixmapItem** classes properly implement hover events
2. **_trigger_segment_hover** method exists in main_window.py for multi-view synchronization
3. Hover events are enabled with `setAcceptHoverEvents(True)` in both hoverable classes
4. Segment info is set with `set_segment_info(segment_id, main_window)` in multi-view mode

### Key Components
- `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/hoverable_polygon_item.py`
- `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/hoverable_pixelmap_item.py`
- `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/main_window.py` (lines 1544-1581)
- `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/modes/multi_view_mode.py` (lines 626-682)

## Debug Changes Made

### 1. Enhanced Debug Logging
Added comprehensive debug logging to track:
- Hover events being triggered
- Segment creation process
- Data structure population
- Cross-viewer hover synchronization

### 2. Fixed Potential Recursion Issue
- Modified `_trigger_segment_hover()` to accept a `triggering_item` parameter
- Added logic to skip the triggering item when applying hover states
- This prevents the item that triggers hover from being affected by its own hover trigger

### 3. Added Comprehensive Tracking
- Debug output when hoverable items are created
- Debug output when brushes/pixmaps are set
- Debug output when segment info is configured
- Debug output during hover event processing

## Most Likely Issues

Based on the code analysis, here are the most probable causes:

### 1. **Hover Events Not Reaching Items** (Most Likely)
- Graphics scene setup issues
- Z-order problems (other items blocking hover)
- Coordinate system misalignment
- Parent-child relationship issues

### 2. **Data Structure Issues**
- `multi_view_segment_items` not properly populated
- Segment indices not matching between creation and lookup
- Missing or incorrect segment_id values

### 3. **View Mode Detection**
- `view_mode` not set to "multi" when expected
- Logic only works in multi-view mode

### 4. **Brush/Pixmap Configuration**
- Invalid brush or pixmap objects
- Transparency issues making hover effects invisible
- Color values that don't provide sufficient contrast

## Debugging Steps

### 1. Run Debug Version
```bash
cd /home/deniz/python_projects/GitHub/LazyLabel
python debug_hover.py
python -m lazylabel.main
```

### 2. Test Scenario
1. Switch to multi-view mode
2. Create segments (polygon or AI)
3. Try hovering over segments
4. Watch console for debug output

### 3. Expected Debug Output
```
Created HoverablePolygonItem for segment 0 in viewer 0
HoverablePolygonItem.set_brushes: default=<QBrush>, hover=<QBrush>
HoverablePolygonItem.set_segment_info: segment_id=0, main_window=True
HoverablePolygonItem.hoverEnterEvent: segment_id=0, main_window=True
Triggering segment hover: segment_id=0, view_mode=multi
_trigger_segment_hover called: segment_id=0, hover_state=True, view_mode=multi
```

### 4. Troubleshooting Based on Output

**If no hoverEnterEvent messages appear:**
- Hover events are not reaching the items
- Check graphics scene setup
- Verify no other items are blocking hover

**If segment_id=None:**
- `set_segment_info` not called or called with None
- Check segment creation process

**If "Segment X not found in viewer Y":**
- Data structure not populated correctly
- Check `multi_view_segment_items` initialization

## Recommended Next Steps

1. **Run the debug version** to identify the specific failure point
2. **Focus on the graphics scene setup** if hover events aren't triggered
3. **Check data structure consistency** if events are triggered but lookup fails
4. **Verify brush/pixmap values** if hover logic executes but no visual change occurs

## Quick Fix Candidates

### If Hover Events Not Triggered:
```python
# In multi_view_mode.py, after adding items to scene:
poly_item.setAcceptHoverEvents(True)  # Ensure it's enabled
poly_item.setZValue(1000)  # Bring to front
```

### If Data Structure Issues:
```python
# Add validation in _trigger_segment_hover:
if segment_id is None:
    logger.warning("segment_id is None, skipping hover")
    return
```

### If Visual Changes Not Visible:
```python
# In hoverable items, add more contrast:
hover_color = QColor(base_color.red(), base_color.green(), base_color.blue(), 255)  # Full opacity
```

## Files Modified for Debug

1. `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/main_window.py`
2. `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/hoverable_polygon_item.py`
3. `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/hoverable_pixelmap_item.py`
4. `/home/deniz/python_projects/GitHub/LazyLabel/src/lazylabel/ui/modes/multi_view_mode.py`

## Test Scripts Created

1. `/home/deniz/python_projects/GitHub/LazyLabel/debug_hover.py` - Enable debug logging
2. `/home/deniz/python_projects/GitHub/LazyLabel/test_hover.py` - Unit test for hover functionality
3. `/home/deniz/python_projects/GitHub/LazyLabel/hover_debug_guide.md` - Detailed debugging guide

Run these debug tools to identify the exact issue and implement the appropriate fix.