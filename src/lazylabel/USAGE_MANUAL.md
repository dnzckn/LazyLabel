# LazyLabel Usage Manual

**Comprehensive Guide to Image Segmentation**

This manual provides detailed instructions for using LazyLabel's image segmentation and annotation capabilities. LazyLabel combines AI-assisted segmentation with manual editing tools to enable efficient, high-precision dataset preparation for machine learning applications.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Interface Overview](#interface-overview)
3. [Core Segmentation Modes](#core-segmentation-modes)
4. [Image Management](#image-management)
5. [Advanced Features](#advanced-features)
6. [Sequence Mode](#sequence-mode)
7. [Export and Data Management](#export-and-data-management)
8. [Segment Management](#segment-management)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Configuration and Settings](#configuration-and-settings)
11. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Initial Setup

1. **Launch Application**
   ```bash
   lazylabel-gui
   ```

2. **Open Image Directory**
   - Click "Open Folder" button in the control panel
   - Select directory containing your images
   - LazyLabel will automatically discover supported image formats (PNG, JPG, TIFF, etc.)

3. **Model Initialization**
   - SAM models are automatically downloaded on first use (~2.5GB)
   - Choose between SAM 1.0 (auto-downloaded by default) or SAM 2.1 in model selection widget

### Basic Workflow

1. **Load Images** - Open folder containing target images
2. **Select Mode** - Choose appropriate segmentation mode (AI, polygon, etc.)
3. **Create Segments** - Generate masks using AI assistance or manual drawing
4. **Refine Results** - Edit, merge, or adjust segments as needed
5. **Export Data** - Save annotations in ML-ready formats

---

## Interface Overview

### Main Components

- **Control Panel (Left)** - Mode selection, tools, and settings
- **Image Viewer (Center)** - Primary workspace for segmentation
- **File Explorer (Right)** - Image navigation and file management
- **Status Bar (Bottom)** - Current mode, coordinates, and system status

### Control Panel Tabs

- **Tools** - Core segmentation modes and basic operations
- **Adjustments** - Image enhancement controls (brightness, contrast, gamma)
- **Filtering** - Advanced thresholding and preprocessing options
- **Cropping** - Border crop and region selection tools
- **Settings** - Application preferences and model selection

---

## Core Segmentation Modes

### 1. AI Point Mode (SAM)

**Primary mode for AI-assisted segmentation using Meta's Segment Anything Model.**

**Activation:** Press `1` or click "Point Mode" button

**Usage:**
- **Left Click** - Add positive points (include in segment)
- **Right Click** - Add negative points (exclude from segment)
- **Space** - Save current segment
- **Shift+Space** - Erase: remove the AI mask shape from all overlapping segments
- **C** - Clear all points
- **Escape** - Cancel current operation

**Best Practices:**
- Start with a single positive point on target object
- Add negative points to exclude unwanted regions
- Use multiple positive points for complex shapes
- Combine with manual editing for precise boundaries

### 2. Polygon Drawing Mode

**Manual polygon creation for precise boundary control.**

**Activation:** Press `2` or click "Polygon Mode" button

**Usage:**
- **Left Click** - Place polygon vertices
- **Double Click** - Complete polygon
- **Shift+Click** (near first point) - Complete polygon and erase that shape from overlapping segments
- **Right Click** - Delete last vertex
- **Escape** - Cancel current polygon

**Best Practices:**
- Place vertices at key boundary points
- Use zoom for precise vertex placement
- Combine with AI mode for efficient workflows

### 3. Bounding Box Mode

**Rectangle-based segmentation for object detection tasks.**

**Activation:** Press `3` or click "Bounding Box" button

**Usage:**
- **Click and Drag** - Draw bounding rectangle
- **Shift+Release** - Release drag with Shift held to erase that rectangle from overlapping segments
- **Space** - Save bounding box
- **Escape** - Cancel current box

### 4. Selection/Edit Mode

**Modify existing segments and vertices.**

**Activation:** Press `E` for selection, `R` for editing

**Usage:**
- **Click Segment** - Select for modification
- **Drag Vertices** - Adjust polygon boundaries
- **M** - Merge selected segments
- **Delete/V** - Remove selected segments
- **Ctrl+A** - Select all segments

### 5. Pan Mode

**Navigate large images efficiently.**

**Activation:** Press `Q` or click "Pan Mode" button

**Usage:**
- **Click and Drag** - Pan image view
- **WASD Keys** - Directional panning
- **Mouse Wheel** - Zoom in/out
- **Period (.)** - Fit image to view

---

## Image Management

### Single Image Mode

Default mode for processing individual images sequentially.

- **Navigation:** Use arrow keys or file explorer
- **Auto-save:** Automatically saves annotations when switching images
- **Quick Access:** Recent files displayed in file explorer

### Multi-View Mode

Advanced mode for simultaneous processing of multiple images.

**Activation:** Select multi-view option in settings

**Features:**
- **Synchronized Operations** - Apply tools across multiple images
- **Batch Processing** - Efficient handling of image sequences
- **Linked Navigation** - Coordinated movement between views
- **Independent Editing** - Individual control when needed

### File Operations

- **Supported Formats:** PNG, JPG, JPEG, TIFF
- **Auto-Discovery** - Recursive directory scanning
- **Batch Navigation** - Efficient switching between images
- **Status Tracking** - Visual indicators for annotated images

---

## Advanced Features

### Image Adjustments

**Real-time image enhancement for better segmentation accuracy.**

**Controls Available:**
- **Brightness** - Global luminance adjustment (-100 to +100)
- **Contrast** - Dynamic range enhancement (0.5 to 2.0)
- **Gamma** - Nonlinear brightness correction (0.1 to 3.0)
- **Reset** - Restore original image values

**Usage:**
- Adjustments are visual-only by default (original image unchanged)
- Enable "Operate On View" setting to apply adjustments to SAM processing
- Use adjustments to optimize visibility for accurate annotation

**Operate On View Setting:**
- **Disabled (Default)** - SAM processes the original, unmodified image
- **Enabled** - SAM processes the currently displayed adjusted image  
- **Critical Use Cases** - Enable when using FFT filtering, channel thresholding, or other advanced preprocessing that enhances segmentation-relevant features

### Border Cropping

**Define custom regions of interest within images.**

**Process:**
1. Click "Crop" mode button
2. Draw crop rectangle on image
3. Apply coordinates manually or via interface
4. All subsequent operations constrained to crop region

**Output Behavior:**
- Pixels outside crop region are blacked out in exported masks
- Original image dimensions are preserved
- Only the crop region contributes to segmentation results

**Applications:**
- Focus on specific image regions
- Reduce processing overhead
- Standardize annotation areas

### Advanced Filtering

#### FFT Thresholding
**Frequency-domain filtering for noise reduction and feature enhancement.**

- **Frequency Threshold** - Control spectral cutoff
- **Intensity Threshold** - Amplitude-based filtering
- **Real-time Preview** - Immediate visual feedback

#### Channel Thresholding
**Color channel-based segmentation assistance.**

- **RGB Channel Control** - Independent channel thresholding
- **Grayscale Support** - Single-channel processing
- **Multi-indicator Interface** - Precise threshold control

#### Fragment Thresholding
**Advanced fragmentation control for complex segmentations.**

- **Fragment Size Control** - Minimum segment area
- **Connectivity Analysis** - Region grouping options
- **Noise Reduction** - Small artifact removal

---

## Sequence Mode

**Propagate masks across image sequences using SAM 2's video predictor.**

Sequence Mode enables efficient annotation of image series by propagating masks from manually annotated reference frames to the entire sequence. This is particularly useful for video frames, time-lapse sequences, or batches of similar images.

### Entering Sequence Mode

1. **Open Folder** - Load a directory containing your image sequence
2. **Switch to Sequence Mode** - Select "Sequence" from the mode dropdown in the control panel
3. **Interface Changes** - Timeline widget appears at the bottom, sequence controls replace single-view controls

### Interface Components

#### Timeline Widget
Visual representation of all frames in the sequence.

**Features:**
- **Frame Cells** - Click to navigate to any frame
- **Status Colors**:
  - Gray - Pending (not yet processed)
  - Green - Reference frame (manually annotated)
  - Blue - Propagated (mask from SAM 2)
  - Red - Flagged (low confidence, needs review)
- **Current Frame** - Highlighted with yellow border
- **Scroll Support** - Navigate long sequences

#### Sequence Controls Panel

**Reference Frames Section:**
- **+ Add Current** - Mark current frame as reference (keyboard: `F`)
- **+ All Before** - Add all frames before current position as references
- **Clear All** - Remove all reference frame designations

**Propagation Section:**
- **Propagate** - Start mask propagation from all references (keyboard: `Ctrl+P`)
- **Range** - Specify start and end frames for propagation
- **Skip Low Conf** - Skip frames with confidence below threshold
- **Min Conf** - Set confidence threshold (0.0-1.0, default 0.95)

**Review Section:**
- **Flagged frames** - Count of frames needing review
- **Prev Flagged** - Navigate to previous flagged frame (keyboard: `Shift+N`)
- **Next Flagged** - Navigate to next flagged frame (keyboard: `N`)

### Basic Workflow

#### Step 1: Annotate Reference Frames
1. Navigate to a representative frame
2. Use AI Point Mode or Polygon Mode to create segments
3. Press `F` or click "Add Current" to mark as reference
4. Repeat for additional reference frames if needed

#### Step 2: Configure Propagation
1. Set the propagation range (default: full sequence)
2. Adjust confidence threshold if needed
3. Enable/disable "Skip Low Conf" based on your workflow

#### Step 3: Run Propagation
1. Click "Propagate" button
2. Watch timeline update as frames are processed
3. Button shows progress during propagation

#### Step 4: Review Flagged Frames
1. Check flagged frame count in Review section
2. Use Next/Prev Flagged buttons to navigate
3. Manually correct or approve flagged frames
4. Add corrections as new reference frames if needed

#### Step 5: Save Results
1. Navigate through sequence to verify results
2. Save individual frames or batch export

### Multi-Reference Propagation

**Why Multiple References?**
- SAM 2 uses visual similarity-based attention, not just temporal proximity
- Multiple references provide better coverage of object variations
- Frames showing different angles/poses improve propagation quality

**Best Practices:**
- Add references showing different object views
- Include frames at key transition points
- For manufacturing/industrial: add references with different part orientations
- Use "Add All Before" when you have a block of manually labeled frames

**How It Works:**
- All reference frames contribute to predictions
- SAM 2 weights references by visual feature similarity
- Nearby similar frames have higher influence
- Dissimilar frames still contribute (useful for non-temporal sequences)

### Confidence Threshold

**Understanding Confidence:**
- Each propagated frame receives a confidence score (0.0-1.0)
- Scores reflect SAM 2's certainty about the prediction
- Lower scores indicate potential quality issues

**Threshold Behavior:**
- Frames below threshold are marked as "flagged" (red in timeline)
- Higher threshold = more frames flagged = stricter quality control
- Default 0.95 provides good balance for most use cases

**Skip Low Conf Option:**
- When enabled: flagged frames receive no masks
- When disabled: all frames get masks, flagged ones need manual review
- Useful when you want to manually handle uncertain frames

### Sequence Settings

Access via Settings tab in control panel:

**Load to Memory:**
- Preload sequence images for faster navigation
- Increases memory usage but improves responsiveness
- Recommended for sequences under 500 frames

### Keyboard Shortcuts (Sequence Mode)

| Action | Key | Description |
|--------|-----|-------------|
| Add Reference | `F` | Mark current frame as reference |
| Propagate | `Ctrl+P` | Start propagation |
| Next Flagged | `N` | Jump to next flagged frame |
| Prev Flagged | `Shift+N` | Jump to previous flagged frame |
| Next Frame | `Right Arrow` | Navigate to next frame |
| Prev Frame | `Left Arrow` | Navigate to previous frame |

### Use Cases

#### Video Annotation
- Load video frames as image sequence
- Annotate keyframes as references
- Propagate to fill intermediate frames
- Review flagged frames for motion blur or occlusion

#### Manufacturing/Industrial Inspection
- Frames may be randomly sorted (no temporal coherence)
- SAM 2's visual similarity attention handles this well
- Add references showing representative part orientations
- Propagation matches by appearance, not frame order

#### Time-Lapse Sequences
- Annotate frames at key time points
- Propagation handles gradual changes
- Flag sudden changes for manual review

#### Batch Processing Similar Images
- Group similar images in sequence
- Annotate a few representative samples
- Propagate to annotate entire batch efficiently

---

## Export and Data Management

### Export Formats

#### NPZ Format (Primary)
**One-hot encoded masks optimized for machine learning workflows.**

```python
import numpy as np

# Load exported data
data = np.load('annotation.npz')
mask = data['mask']  # Shape: (height, width, num_classes)

# Access individual class masks
background = mask[:, :, 0]
object_class_1 = mask[:, :, 1]
object_class_2 = mask[:, :, 2]
```

#### JSON Format  
**Class alias definitions for annotation metadata.**

Contains class name mappings and aliases used in the annotation session.

### Class Management

- **Dynamic Class Creation** - Add classes as needed
- **Class Aliases** - Customizable class names
- **Reorderable Classes** - Drag-and-drop class organization
- **Color Coding** - Visual class identification

### Auto-Save Functionality

- **Automatic Triggers** - Save on image navigation
- **Configurable Behavior** - Enable/disable in settings
- **Safe Operation** - No data loss during normal operation

---

## Segment Management

### Segment Selection and Editing

#### Selection Mode (`E` Key)
**Select segments for batch operations and editing.**

**Activation:** Press `E` to enter Selection Mode

**Selection Methods:**
- **Single Selection** - Click on segments to select/deselect
- **Multiple Selection** - Hold `Ctrl` + click to add segments to selection
- **Select All** - Press `Ctrl+A` to select all segments
- **Table Selection** - Use segment table in right panel for precise selection

**Visual Indicators:**
- Selected segments display with highlighted colored overlays
- Selection status visible in segment table
- Selections persist across mode changes

#### Edit Mode (`R` Key) - Polygon Vertices Only
**Move vertices of polygon segments.**

**Activation:** Press `R` to enter Edit Mode

**Requirements:**
- Only works on **Polygon type segments** (not AI/SAM segments)
- At least one polygon segment must be selected
- Cannot edit AI-generated segments or loaded segments

**Operations:**
- **Drag Vertices** - Move individual polygon points by dragging cyan handles
- **Real-time Updates** - Polygon shape updates as you drag vertices
- **Visual Feedback** - Vertex handles appear as cyan semi-transparent circles

**Limitations:**
- **Cannot add vertices** - Only existing vertices can be moved
- **Cannot remove vertices** - No vertex deletion functionality
- **Polygon-only** - AI segments and bounding boxes cannot be edited

### Segment Removal (Shift Modifier)

#### Erase Mode
**Remove overlapping segments using the current shape as an eraser.**

The Shift modifier transforms any segment completion into an erase operation. Instead of adding a new segment, it subtracts the shape from all existing overlapping segments.

**How to Use:**

Hold `Shift` during the normal completion gesture for any mode:

- **AI Mode** - Place points, then `Shift+Space` (Space completes, Shift makes it erase)
- **Polygon Mode** - Draw vertices, then `Shift+Click` near the first point (click-to-close completes, Shift makes it erase)
- **Bounding Box Mode** - Drag a rectangle, then release with `Shift` held (release completes, Shift makes it erase)

**Behavior:**
- Segments fully covered by the erase shape are removed entirely
- Segments partially covered are split into remaining connected components
- The erase shape itself is not saved as a segment
- Action is recorded for undo/redo support

**Use Cases:**
- Clean up overlapping regions between adjacent segments
- Cut holes in existing segments
- Remove unwanted parts of AI-generated segments

### Class Management

#### Active Class System
**Set which class new segments will be assigned to.**

**Setting Active Class:**
- **Click Class in Table** - Click any class in the class manager to make it active
- **Visual Feedback** - Active class is highlighted in the class table
- **New Segment Assignment** - All newly created segments automatically get the active class

#### Class Assignment (`M` Key)
**Assign selected segments to the same class.**

**Important:** The `M` key does **NOT** merge segment geometry - it assigns segments to the same class.

**Process:**
1. Select multiple segments using Selection Mode (`E`)
2. Press `M` to assign all selected segments to the same class
3. System uses the lowest class ID among selected segments
4. If no segments have classes, assigns the next available class ID
5. Selection is cleared after assignment

**Class Table Features:**
- **Reorderable** - Drag classes to change display order
- **Color Coding** - Each class has a distinct color
- **Class Aliases** - Customizable class names

### Segment Types and Persistence

#### Understanding Segment Types
LazyLabel uses three distinct segment types with different capabilities:

**AI Segments (type: "AI")**
- Generated by SAM model clicks
- Stored as rasterized masks immediately
- **Cannot be edited after creation**
- Never have editability (no vertex information)

**Polygon Segments (type: "Polygon")**  
- Hand-drawn using polygon mode
- Stored as vertex lists during current session
- **Can be edited in Edit Mode (`R`) before saving**
- Lose editability when saved (become "Loaded" type)

**Loaded Segments (type: "Loaded")**
- Previously saved segments loaded from NPZ files
- All segments become "Loaded" type after reload
- **No vertex information preserved**
- Cannot be edited regardless of original type

#### Reloading Behavior - Critical Limitation
**All segments lose editability when reloaded from saved files.**

**Technical Reason:**
- NPZ format stores only final rasterized masks, not vector data
- Vertex information is not preserved in the export format
- This is a fundamental limitation of the storage system

**Practical Impact:**
- **AI segments** - Already non-editable, no change
- **Polygon segments** - Become non-editable after reload
- **All reloaded segments** - Cannot use Edit Mode (`R`)

**Workaround Strategy:**
- Edit all segments immediately before saving
- Complete all vertex adjustments in the current session
- Cannot defer editing to later sessions

### Undo/Redo System

#### Supported Operations
**Comprehensive action tracking for immediate operations.**

**Tracked Actions:**
- **Segment Creation** - AI clicks, polygon drawing, bounding boxes
- **Vertex Movement** - Individual vertex position changes
- **Polygon Movement** - Entire polygon repositioning  
- **Segment Deletion** - Complete segment removal

**Undo/Redo Keys:**
- **Undo** - `Ctrl+Z` reverses last action
- **Redo** - `Ctrl+Y` or `Ctrl+Shift+Z` restores undone action

#### Undo Limitations
**Some operations cannot be undone.**

**Non-Undoable Actions:**
- **Class assignments** - `M` key operations are permanent
- **Loaded segment operations** - Actions on reloaded segments
- **Mode changes** - Switching between AI/polygon/selection modes

**History Management:**
- History cleared when loading new images
- Limited history depth to prevent memory issues

### Workflow Recommendations

#### Optimal Segment Management Workflow
**Maximize editability before saving.**

**Recommended Process:**
1. **Create Segments** - Use AI mode for initial segmentation
2. **Immediate Editing** - Edit vertices while segments are still polygons
3. **Class Organization** - Set active classes and use `M` key for assignment
4. **Final Review** - Complete all editing before navigation
5. **Save Only When Complete** - Remember that editing is lost after save

#### Common Workflow Mistakes
**Avoid these pitfalls for efficient annotation.**

**Mistake: Editing After Save**
- Problem: All segments become non-editable after reload
- Solution: Complete editing before saving or navigating away

**Mistake: Expecting Geometric Merging**
- Problem: `M` key assigns classes, doesn't merge shapes
- Solution: Use class assignment for organization, not shape combination

**Mistake: Trying to Edit AI Segments**  
- Problem: AI segments cannot be edited with `R` key
- Solution: Use polygon mode for segments requiring vertex editing

---

## Keyboard Shortcuts

### Primary Navigation

| Action | Primary Key | Secondary Key | Description |
|--------|-------------|---------------|-------------|
| **Modes** | | | |
| Point Mode (SAM) | `1` | - | AI-assisted segmentation |
| Polygon Mode | `2` | - | Manual polygon drawing |
| Bounding Box | `3` | - | Rectangle segmentation |
| Selection Mode | `E` | - | Segment selection |
| Edit Mode | `R` | - | Vertex editing |
| Pan Mode | `Q` | - | Image navigation |

### Core Actions

| Action | Primary Key | Secondary Key | Description |
|--------|-------------|---------------|-------------|
| Save Segment | `Space` | - | Confirm current annotation |
| Erase with Segment | `Shift`+completion | - | Hold Shift during completion to erase instead of add |
| Save Output | `Enter` | - | Export current annotations |
| Clear Points | `C` | - | Remove all points |
| Undo | `Ctrl+Z` | - | Reverse last action |
| Redo | `Ctrl+Y` | `Ctrl+Shift+Z` | Restore undone action |
| Cancel/Escape | `Escape` | - | Cancel current operation |

### Segment Operations

| Action | Primary Key | Secondary Key | Description |
|--------|-------------|---------------|-------------|
| Assign Same Class | `M` | - | Assign selected segments to same class |
| Delete Selected | `V` | `Backspace` | Remove selected segments |
| Select All | `Ctrl+A` | - | Select all segments |

### Navigation and View

| Action | Primary Key | Secondary Key | Description |
|--------|-------------|---------------|-------------|
| Next Image | `Right Arrow` | - | Navigate to next image |
| Previous Image | `Left Arrow` | - | Navigate to previous image |
| Fit View | `.` (Period) | - | Fit image to viewport |
| Zoom In | `Ctrl+Plus` | - | Increase magnification |
| Zoom Out | `Ctrl+Minus` | - | Decrease magnification |

### Movement Controls

| Action | Primary Key | Secondary Key | Description |
|--------|-------------|---------------|-------------|
| Pan Up | `W` | - | Move view upward |
| Pan Down | `S` | - | Move view downward |
| Pan Left | `A` | - | Move view leftward |
| Pan Right | `D` | - | Move view rightward |

### Sequence Mode Controls

| Action | Primary Key | Description |
|--------|-------------|-------------|
| Add Reference | `F` | Mark current frame as reference |
| Start Propagation | `Ctrl+P` | Propagate masks from references |
| Next Flagged | `N` | Navigate to next flagged frame |
| Previous Flagged | `Shift+N` | Navigate to previous flagged frame |

### Shortcut Customization

**Access Configuration:**
1. Click "Hotkeys" button in control panel
2. Navigate to appropriate category tab
3. Click target key field and press desired key combination
4. Save configuration using "Save Hotkeys" button

**Advanced Options:**
- **Modifier Combinations** - `Ctrl`, `Shift`, `Alt` supported
- **Function Keys** - `F1-F12` available
- **Dual Assignment** - Primary and secondary shortcuts per action
- **Conflict Prevention** - System prevents duplicate assignments

---

## Configuration and Settings

### Model Selection

**SAM Model Options:**
- **SAM 1.0** - Auto-downloaded by default, reliable performance
- **SAM 2.1** - Enhanced accuracy, optional dependency (requires separate installation)

**Model Management:**
- Automatic model downloading and caching
- Performance optimization settings
- Memory usage configuration

### Application Preferences

**General Settings:**
- **Auto-save Behavior** - Configure automatic saving
- **Multi-view Options** - Enable/disable simultaneous processing
- **File Handling** - Default export locations and formats
- **Operate On View** - Control whether SAM processes adjusted or original images

**Critical Setting: Operate On View**
- **Location:** Settings tab in control panel
- **Default:** Disabled (SAM uses original images)
- **When to Enable:** When using FFT filtering, channel thresholding, or advanced preprocessing
- **Impact:** Allows SAM to benefit from advanced filtering and preprocessing operations

**Performance Settings:**
- **Memory Management** - Optimize for available resources
- **Processing Threads** - Adjust for system capabilities
- **Cache Configuration** - Balance speed and storage

### User Interface

**Customization Options:**
- **Theme Selection** - Dark mode (default) or custom themes
- **Panel Layout** - Adjustable interface arrangement
- **Status Information** - Configure displayed metrics

---

## Troubleshooting

### Common Issues

#### Model Loading Problems
- **Symptom:** SAM model fails to load
- **Solution:** Check internet connection, verify disk space (2.5GB required)
- **Alternative:** Use cached models in `~/.lazylabel/models/`

#### Performance Issues
- **Symptom:** Slow segmentation or interface lag
- **Solutions:** 
  - Reduce image resolution for processing
  - Close unnecessary applications
  - Adjust memory settings in preferences

#### Poor Segmentation Quality
- **Symptom:** SAM produces inaccurate or incomplete segments
- **Solutions:**
  - Apply FFT filtering or channel thresholding to enhance segmentation-relevant features
  - Enable "Operate On View" setting when using advanced preprocessing
  - Use additional positive/negative points to guide segmentation
  - Switch between SAM 1.0 and SAM 2.1 models for different performance characteristics

#### Export Problems
- **Symptom:** Export fails or produces empty files
- **Solutions:**
  - Verify write permissions to target directory
  - Check available disk space
  - Ensure segments exist before export

### Memory Management

**Large Image Handling:**
- Use crop functionality to focus on regions of interest
- Process images in batches rather than loading all simultaneously
- Monitor system memory usage during operation

### File Compatibility

**Supported Formats:**
- **Input:** PNG, JPG, JPEG, TIFF
- **Output:** NPZ (primary), JSON (class aliases)
- **Limitations:** Very large images (>4GB) may require preprocessing

---

## Best Practices

### Efficient Workflows

1. **Preparation**
   - Organize images in logical directory structure
   - Ensure consistent image quality and format
   - Plan class hierarchy before annotation

2. **Annotation Strategy**
   - Start with AI mode for initial segmentation
   - Use manual tools for precision refinement
   - Leverage keyboard shortcuts for speed

3. **Quality Control**
   - Regular verification of annotations
   - Consistent class assignment
   - Validation of export formats

### Performance Optimization

- **Use appropriate image resolution** - Balance quality and processing speed
- **Leverage auto-save** - Prevent data loss during long annotation sessions
- **Organize classes efficiently** - Plan class structure for easy navigation
- **Regular exports** - Backup work incrementally

---

**LazyLabel** - Advanced image annotation software for computer vision research and machine learning applications.