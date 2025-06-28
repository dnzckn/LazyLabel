# Hotkey Management System

## Overview
LazyLabel now includes a comprehensive hotkey management system that allows users to customize keyboard shortcuts for all major functions. This system provides both session-based and persistent hotkey configuration.

## Features

### ✅ **Hotkey Configuration Dialog**
- **Access**: Click the "Hotkeys" button in the left control panel
- **Interface**: Tabbed dialog organized by function categories
- **Real-time editing**: Click any hotkey field and press desired key combination
- **Conflict detection**: Prevents duplicate key assignments
- **Visual feedback**: Highlights mouse-related actions that cannot be modified

### ✅ **Comprehensive Hotkey Coverage**
The system manages 27 different hotkey actions across 7 categories:

#### **Navigation (3 actions)**
- Load Next Image: `Right Arrow`
- Load Previous Image: `Left Arrow`  
- Fit View: `Period (.)`

#### **Modes (5 actions)**
- Point Mode (SAM): `1`
- Polygon Mode: `2`
- Bounding Box Mode: `3`
- Selection Mode: `E`
- Pan Mode: `Q`
- Edit Mode: `R`

#### **Actions (7 actions)**
- Clear Points/Vertices: `C`
- Save Current Segment: `Space`
- Save Output: `Return/Enter`
- Undo Last Action: `Ctrl+Z`
- Redo Last Action: `Ctrl+Y` or `Ctrl+Shift+Z`
- Cancel/Clear Selection: `Escape`

#### **Segments (4 actions)**
- Merge Selected Segments: `M`
- Delete Selected Segments: `V` or `Backspace`
- Select All Segments: `Ctrl+A`

#### **View (2 actions)**
- Zoom In: `Ctrl+Plus`
- Zoom Out: `Ctrl+Minus`

#### **Movement (4 actions)**
- Pan Up: `W`
- Pan Down: `S`
- Pan Left: `A`
- Pan Right: `D`

#### **Mouse (3 actions - Read-only)**
- Add Positive Point / Select: `Left Click`
- Add Negative Point: `Right Click`
- Drag/Pan: `Mouse Drag`

### ✅ **Primary and Secondary Keys**
- **Primary Key**: Main hotkey for each action
- **Secondary Key**: Optional alternative hotkey (initially set to None)
- **Dual Assignment**: Both keys trigger the same action
- **Independent Configuration**: Set primary and secondary keys separately

### ✅ **Session vs Persistent Settings**
- **Session Only**: Changes apply immediately but are lost when application closes
- **Persistent**: Click "Save Hotkeys" to save configuration to file
- **Auto-load**: Saved hotkeys automatically load on application startup

### ✅ **Safety Features**
- **Mouse Protection**: Mouse-related actions cannot be reassigned
- **Conflict Prevention**: System prevents duplicate key assignments
- **Default Reset**: "Reset to Defaults" button restores original hotkeys
- **Validation**: Invalid key combinations are rejected

## Usage Instructions

### **Opening the Hotkey Dialog**
1. Launch LazyLabel
2. Click the "Hotkeys" button in the left control panel
3. The Hotkey Configuration dialog opens

### **Customizing Hotkeys**
1. Navigate to the appropriate category tab
2. Click on a Primary Key or Secondary Key field
3. The field highlights yellow and shows "Press a key..."
4. Press your desired key combination
5. The new hotkey is immediately assigned

### **Saving Hotkeys**
1. Make your desired changes in the dialog
2. Click "Save Hotkeys" button
3. Hotkeys are saved to `~/.config/lazylabel/hotkeys.json`
4. Settings persist between application sessions

### **Resetting to Defaults**
1. Click "Reset to Defaults" button
2. Confirm the action
3. All hotkeys return to original values
4. Click "Save Hotkeys" to make the reset persistent

## Technical Implementation

### **Architecture**
- **HotkeyManager**: Core hotkey management class
- **HotkeyAction**: Data structure for individual hotkey actions
- **HotkeyDialog**: PyQt6 dialog for hotkey configuration
- **HotkeyLineEdit**: Custom widget for capturing key presses

### **File Storage**
- **Location**: `~/.config/lazylabel/hotkeys.json`
- **Format**: JSON with action names and key mappings
- **Backup**: Original defaults preserved in code

### **Integration**
- **Dynamic Shortcuts**: QShortcut objects created based on current configuration
- **Real-time Updates**: Shortcuts update immediately when dialog closes
- **Memory Management**: Old shortcuts properly cleaned up

### **Key Capture**
- **Smart Detection**: Captures key combinations including modifiers
- **User Feedback**: Visual indication during key capture
- **Escape Handling**: Click away or focus loss cancels capture

## Benefits

### **🎯 User Experience**
- **Customization**: Adapt interface to personal workflow
- **Efficiency**: Use familiar key combinations
- **Accessibility**: Accommodate different user needs
- **Flexibility**: Change hotkeys without code modification

### **🔧 Developer Benefits**
- **Maintainable**: Centralized hotkey management
- **Extensible**: Easy to add new hotkey actions
- **Robust**: Conflict detection and validation
- **Persistent**: User preferences preserved

### **🛡️ Safety**
- **Protected Actions**: Mouse interactions cannot be broken
- **Conflict Prevention**: No duplicate assignments
- **Graceful Fallback**: Invalid configurations handled safely
- **Reset Option**: Always possible to return to defaults

## Example Workflow

1. **Initial Setup**: User opens LazyLabel with default hotkeys
2. **Customization**: User prefers `F1` for Point Mode instead of `1`
3. **Configuration**: 
   - Click "Hotkeys" button
   - Navigate to "Modes" tab
   - Click "Primary Key" field for "Point Mode (SAM)"
   - Press `F1`
   - Key is assigned and conflict-checked
4. **Persistence**: Click "Save Hotkeys" to preserve setting
5. **Usage**: `F1` now activates Point Mode in current and future sessions

## File Structure

```
src/lazylabel/
├── config/
│   ├── hotkeys.py              # HotkeyManager and HotkeyAction classes
│   └── __init__.py             # Export hotkey classes
├── ui/
│   ├── hotkey_dialog.py        # Hotkey configuration dialog
│   ├── control_panel.py        # Added "Hotkeys" button
│   └── main_window.py          # Integrated hotkey system
└── HOTKEY_FEATURE.md           # This documentation
```

## Future Enhancements

- **Import/Export**: Share hotkey configurations
- **Profiles**: Multiple hotkey sets for different workflows
- **Macro Support**: Complex key sequences
- **Context Sensitivity**: Different hotkeys for different modes
- **Visual Indicators**: Show current hotkeys in tooltips

The hotkey management system provides a professional, user-friendly way to customize LazyLabel's interface while maintaining the application's robust functionality.