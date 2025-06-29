# ⌨️ Hotkey Management System

**Professional hotkey customization for efficient workflows**

LazyLabel features a comprehensive hotkey system with 27+ configurable shortcuts organized by function. Customize every keyboard shortcut to match your workflow.

![Hotkey System](https://img.shields.io/badge/Hotkeys-27%2B%20Configurable-blue?style=flat-square)

---

## 🚀 Quick Start

1. **Open Hotkeys** → Click "Hotkeys" button in control panel
2. **Customize** → Click any key field and press desired shortcut
3. **Save** → Click "Save Hotkeys" for persistence
4. **Enjoy** → Use your personalized shortcuts!

---

## ✨ Key Features

### **🎯 Smart Configuration**
- **Real-time editing** - Click field → Press key → Instant assignment
- **Conflict prevention** - No duplicate shortcuts allowed
- **Primary + Secondary** keys for each action
- **Category organization** across 7 function groups

### **💾 Persistent Settings**
- **Auto-save** to `~/.config/lazylabel/hotkeys.json`
- **Session persistence** across app restarts  
- **Reset to defaults** anytime
- **Immediate application** of changes

### **🛡️ Safety Features**
- **Mouse protection** - Click actions can't be reassigned
- **Graceful fallback** for invalid configurations
- **Visual feedback** during key capture
- **Escape handling** to cancel changes

---

## ⌨️ Default Hotkeys

| Category | Action | Primary Key | Secondary |
|----------|--------|-------------|-----------|
| **🎯 Modes** | Point Mode (SAM) | `1` | - |
| | Polygon Mode | `2` | - |
| | Bounding Box | `3` | - |
| | Selection Mode | `E` | - |
| | Edit Mode | `R` | - |
| | Pan Mode | `Q` | - |
| **⚡ Actions** | Save Segment | `Space` | - |
| | Save Output | `Enter` | - |
| | Clear Points | `C` | - |
| | Undo | `Ctrl+Z` | - |
| | Redo | `Ctrl+Y` | `Ctrl+Shift+Z` |
| | Cancel/Escape | `Escape` | - |
| **🔧 Segments** | Merge Selected | `M` | - |
| | Delete Selected | `V` | `Backspace` |
| | Select All | `Ctrl+A` | - |
| **🖼️ Navigation** | Next Image | `Right Arrow` | - |
| | Previous Image | `Left Arrow` | - |
| | Fit View | `.` (Period) | - |
| **🔍 View** | Zoom In | `Ctrl+Plus` | - |
| | Zoom Out | `Ctrl+Minus` | - |
| **📐 Movement** | Pan Up | `W` | - |
| | Pan Down | `S` | - |
| | Pan Left | `A` | - |
| | Pan Right | `D` | - |

---

## 🎨 Customization Guide

### **Basic Customization**
```
1. Click "Hotkeys" button
2. Select category tab
3. Click key field → Press new key
4. Click "Save Hotkeys"
```

### **Advanced Features**
- **Modifier keys**: `Ctrl`, `Shift`, `Alt` combinations supported
- **Function keys**: `F1-F12` available
- **Special keys**: `Space`, `Enter`, `Escape`, Arrow keys
- **Dual assignment**: Set both primary and secondary shortcuts

### **Best Practices**
- **Keep related actions close** on keyboard (e.g., WASD for movement)
- **Use modifier combos** for destructive actions (e.g., `Ctrl+Del`)
- **Leverage muscle memory** from other software
- **Test shortcuts** before saving for comfort

---

## 🔧 Technical Details

### **Architecture**
```python
# Core components
HotkeyManager       # Central hotkey coordination
HotkeyAction        # Individual shortcut definitions  
HotkeyDialog        # Configuration interface
HotkeyLineEdit      # Key capture widget
```

### **File Format**
```json
{
  "point_mode": {
    "primary": "1",
    "secondary": null
  },
  "save_segment": {
    "primary": "Space", 
    "secondary": null
  }
}
```

### **Integration Points**
- **Main Window** - QShortcut creation and management
- **Control Panel** - "Hotkeys" button access
- **Settings System** - Persistent configuration
- **Signal System** - Action triggering

---

## 🛠️ Development

### **Adding New Hotkeys**
```python
# 1. Define action in HotkeyManager
self.actions["new_action"] = HotkeyAction(
    name="New Action",
    default_primary="F5", 
    category="Custom"
)

# 2. Connect to signal in MainWindow
self.hotkey_manager.get_shortcut("new_action").activated.connect(
    self.handle_new_action
)

# 3. Add to dialog tabs
```

### **Categories**
- **Navigation** - Image browsing
- **Modes** - Tool switching  
- **Actions** - Core operations
- **Segments** - Shape management
- **View** - Zoom/pan controls
- **Movement** - WASD navigation
- **Mouse** - Click actions (read-only)

---

## 🎯 Use Cases

### **Power Users**
- **Vim-style** navigation (`hjkl` for movement)
- **Photoshop-style** tools (`v` for selection)
- **Custom workflows** for repetitive tasks

### **Accessibility**
- **One-handed** operation support
- **Alternative key** positions
- **Reduced hand movement** patterns

### **Multi-Language**
- **QWERTY alternatives** (Dvorak, Colemak)
- **International keyboards** support
- **Symbol key** accessibility

---

## 🚀 Pro Tips

### **Efficiency Shortcuts**
```
🔥 Quick Save:     Space + Enter combo
⚡ Fast Navigation: Arrow keys for images  
🎯 Precise Control: Number keys for modes
🛠️ Edit Flow:      E → R → M workflow
```

### **Common Customizations**
- **Gamers**: WASD → Arrow keys for movement
- **CAD Users**: Function keys for tools
- **Designers**: Shift+Key for secondary actions
- **Researchers**: Ctrl+Key for batch operations

---

## ☕ Troubleshooting

### **Key Not Working?**
1. Check for conflicts in dialog
2. Ensure key is supported
3. Try primary vs secondary assignment
4. Reset to defaults if needed

### **Shortcuts Not Saving?**
1. Verify write permissions to config directory
2. Check disk space
3. Try manual save button
4. Restart application

---

**🎮 Game-changing productivity for power users** ⚡