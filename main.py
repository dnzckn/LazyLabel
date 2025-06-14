import sys
import os
import numpy as np
import qdarktheme
import cv2
from PyQt6.QtWidgets import (
    QApplication,
    QMainWindow,
    QWidget,
    QHBoxLayout,
    QFileDialog,
    QGraphicsItem,
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QTableWidgetItem,
    QGraphicsPolygonItem,
    QTableWidgetSelectionRange,
)
from PyQt6.QtGui import QPixmap, QColor, QPen, QBrush, QPolygonF, QIcon
from PyQt6.QtCore import Qt, QPointF, QTimer
from photo_viewer import PhotoViewer
from sam_model import SamModel
from utils import mask_to_pixmap
from scipy.spatial import ConvexHull
from controls import ControlPanel, RightPanel
from custom_file_system_model import CustomFileSystemModel
from editable_vertex import EditableVertexItem
from hoverable_polygon_item import HoverablePolygonItem
from numeric_table_widget_item import NumericTableWidgetItem


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LazyLabel by DNC")

        icon_path = os.path.join(
            os.path.dirname(__file__), "demo_pictures", "logo2.png"
        )
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))

        self.setGeometry(50, 50, 1600, 900)

        self.sam_model = SamModel(model_type="vit_h", model_path="sam_vit_h_4b8939.pth")
        self.mode = "sam_points"
        self.previous_mode = "sam_points"
        self.current_image_path = None
        self.current_file_index = None
        self.next_class_id = 0

        self.point_items, self.positive_points, self.negative_points = [], [], []
        self.polygon_points, self.polygon_preview_items = [], []
        self.rubber_band_line = None

        self.segments, self.segment_items, self.highlight_items = [], {}, []
        self.is_dragging_polygon, self.drag_start_pos, self.drag_initial_vertices = (
            False,
            None,
            {},
        )

        self.control_panel = ControlPanel()
        self.right_panel = RightPanel()
        self.viewer = PhotoViewer(self)
        self.viewer.setMouseTracking(True)
        self.file_model = CustomFileSystemModel()
        self.right_panel.file_tree.setModel(self.file_model)
        self.right_panel.file_tree.setColumnWidth(0, 200)

        main_layout = QHBoxLayout()
        main_layout.addWidget(self.control_panel)
        main_layout.addWidget(self.viewer, 1)
        main_layout.addWidget(self.right_panel)
        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)

        self.control_panel.device_label.setText(
            f"Device: {str(self.sam_model.device).upper()}"
        )
        self.setup_connections()
        self.set_sam_mode()

    def setup_connections(self):
        self._original_mouse_press = self.viewer.scene().mousePressEvent
        self._original_mouse_move = self.viewer.scene().mouseMoveEvent
        self._original_mouse_release = self.viewer.scene().mouseReleaseEvent

        self.viewer.scene().mousePressEvent = self.scene_mouse_press
        self.viewer.scene().mouseMoveEvent = self.scene_mouse_move
        self.viewer.scene().mouseReleaseEvent = self.scene_mouse_release

        self.right_panel.btn_open_folder.clicked.connect(self.open_folder_dialog)
        self.right_panel.file_tree.doubleClicked.connect(self.load_selected_image)
        self.right_panel.btn_merge_selection.clicked.connect(
            self.assign_selected_to_class
        )
        self.right_panel.btn_delete_selection.clicked.connect(
            self.delete_selected_segments
        )
        self.right_panel.segment_table.itemSelectionChanged.connect(
            self.highlight_selected_segments
        )
        self.right_panel.segment_table.itemChanged.connect(self.handle_class_id_change)
        self.right_panel.btn_reassign_classes.clicked.connect(self.reassign_class_ids)
        self.right_panel.class_filter_combo.currentIndexChanged.connect(
            self.update_segment_table
        )

        self.control_panel.btn_sam_mode.clicked.connect(self.set_sam_mode)
        self.control_panel.btn_polygon_mode.clicked.connect(self.set_polygon_mode)
        self.control_panel.btn_selection_mode.clicked.connect(
            self.toggle_selection_mode
        )
        self.control_panel.btn_clear_points.clicked.connect(self.clear_all_points)

    def set_mode(self, mode_name, is_toggle=False):
        if self.mode == "edit" and mode_name != "edit":
            self.display_all_segments()
        if not is_toggle and self.mode not in ["pan", "selection", "edit"]:
            self.previous_mode = self.mode
        self.mode = mode_name
        self.control_panel.mode_label.setText(
            f"Mode: {mode_name.replace('_', ' ').title()}"
        )
        self.clear_all_points()
        self.viewer.setDragMode(
            self.viewer.DragMode.ScrollHandDrag
            if self.mode == "pan"
            else self.viewer.DragMode.NoDrag
        )

    def set_sam_mode(self):
        self.set_mode("sam_points")

    def set_polygon_mode(self):
        self.set_mode("polygon")

    def toggle_mode(self, new_mode):
        if self.mode == new_mode:
            self.set_mode(self.previous_mode, is_toggle=True)
        else:
            if self.mode not in ["pan", "selection", "edit"]:
                self.previous_mode = self.mode
            self.set_mode(new_mode, is_toggle=True)

    def toggle_pan_mode(self):
        self.toggle_mode("pan")

    def toggle_selection_mode(self):
        self.toggle_mode("selection")

    def toggle_edit_mode(self):
        selected_indices = self.get_selected_segment_indices()
        can_edit = any(
            self.segments[i].get("type") == "Polygon" for i in selected_indices
        )
        if self.mode == "edit":
            self.set_mode("selection", is_toggle=True)
        elif self.mode == "selection" and can_edit:
            self.set_mode("edit", is_toggle=True)
            self.display_all_segments()

    def open_folder_dialog(self):
        folder_path = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder_path:
            self.right_panel.file_tree.setRootIndex(
                self.file_model.setRootPath(folder_path)
            )
        self.viewer.setFocus()

    def load_selected_image(self, index):
        if not index.isValid():
            return

        self.current_file_index = index
        path = self.file_model.filePath(index)

        if os.path.isfile(path) and path.lower().endswith((".png", ".jpg", ".jpeg")):
            self.current_image_path = path
            pixmap = QPixmap(self.current_image_path)
            if not pixmap.isNull():
                self.reset_state()
                self.viewer.set_photo(pixmap)
                self.sam_model.set_image(self.current_image_path)
                self.load_existing_mask()
                self.viewer.setFocus()

    def reset_state(self):
        self.clear_all_points()
        self.segments.clear()
        self.next_class_id = 0
        self.update_all_lists()
        items_to_remove = [
            item
            for item in self.viewer.scene().items()
            if item is not self.viewer._pixmap_item
        ]
        for item in items_to_remove:
            self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        self.highlight_items.clear()

    def keyPressEvent(self, event):
        key, mods = event.key(), event.modifiers()
        if event.isAutoRepeat():
            return
        if key == Qt.Key.Key_W:
            self.viewer.verticalScrollBar().setValue(
                self.viewer.verticalScrollBar().value()
                - int(self.viewer.height() * 0.1)
            )
        elif key == Qt.Key.Key_S and not mods:
            self.viewer.verticalScrollBar().setValue(
                self.viewer.verticalScrollBar().value()
                + int(self.viewer.height() * 0.1)
            )
        elif key == Qt.Key.Key_A and not (mods & Qt.KeyboardModifier.ControlModifier):
            self.viewer.horizontalScrollBar().setValue(
                self.viewer.horizontalScrollBar().value()
                - int(self.viewer.width() * 0.1)
            )
        elif key == Qt.Key.Key_D:
            self.viewer.horizontalScrollBar().setValue(
                self.viewer.horizontalScrollBar().value()
                + int(self.viewer.width() * 0.1)
            )
        elif key == Qt.Key.Key_1:
            self.set_sam_mode()
        elif key == Qt.Key.Key_2:
            self.set_polygon_mode()
        elif key == Qt.Key.Key_E:
            self.toggle_selection_mode()
        elif key == Qt.Key.Key_Q:
            self.toggle_pan_mode()
        elif key == Qt.Key.Key_R:
            self.toggle_edit_mode()
        elif key == Qt.Key.Key_C:
            self.clear_all_points()
        elif key == Qt.Key.Key_V or key == Qt.Key.Key_Backspace:
            self.delete_selected_segments()
        elif key == Qt.Key.Key_M:
            self.assign_selected_to_class()
        elif key == Qt.Key.Key_Z and mods == Qt.KeyboardModifier.ControlModifier:
            self.undo_last_action()
        elif key == Qt.Key.Key_A and mods == Qt.KeyboardModifier.ControlModifier:
            self.right_panel.segment_table.selectAll()
        elif key == Qt.Key.Key_Space:
            self.save_current_segment()
        elif key == Qt.Key.Key_Return or key == Qt.Key.Key_Enter:
            self.save_output_to_npz()

    def scene_mouse_press(self, event):
        self._original_mouse_press(event)
        if event.isAccepted():
            return
        pos = event.scenePos()
        if (
            self.viewer._pixmap_item.pixmap().isNull()
            or not self.viewer._pixmap_item.pixmap().rect().contains(pos.toPoint())
        ):
            return
        if self.mode == "sam_points":
            if event.button() == Qt.MouseButton.LeftButton:
                self.add_point(pos, positive=True)
                self.update_segmentation()
            elif event.button() == Qt.MouseButton.RightButton:
                self.add_point(pos, positive=False)
                self.update_segmentation()
        elif self.mode == "polygon":
            if event.button() == Qt.MouseButton.LeftButton:
                self.handle_polygon_click(pos)
        elif self.mode == "selection":
            if event.button() == Qt.MouseButton.LeftButton:
                self.handle_segment_selection_click(pos)
        elif self.mode == "edit":
            self.drag_start_pos = pos
            self.is_dragging_polygon = True
            selected_indices = self.get_selected_segment_indices()
            self.drag_initial_vertices = {
                i: list(self.segments[i]["vertices"])
                for i in selected_indices
                if self.segments[i].get("type") == "Polygon"
            }

    def scene_mouse_move(self, event):
        pos = event.scenePos()
        if self.mode == "edit" and self.is_dragging_polygon:
            delta = pos - self.drag_start_pos
            for i, initial_verts in self.drag_initial_vertices.items():
                self.segments[i]["vertices"] = [
                    QPointF(v.x() + delta.x(), v.y() + delta.y()) for v in initial_verts
                ]
                self.update_polygon_visuals(i)
        elif self.mode == "polygon" and self.polygon_points:
            if self.rubber_band_line is None:
                self.rubber_band_line = QGraphicsLineItem()
                self.rubber_band_line.setPen(
                    QPen(Qt.GlobalColor.white, 2, Qt.PenStyle.DotLine)
                )
                self.viewer.scene().addItem(self.rubber_band_line)
            self.rubber_band_line.setLine(
                self.polygon_points[-1].x(),
                self.polygon_points[-1].y(),
                pos.x(),
                pos.y(),
            )
            self.rubber_band_line.show()
        else:
            self._original_mouse_move(event)

    def scene_mouse_release(self, event):
        if self.mode == "edit" and self.is_dragging_polygon:
            self.is_dragging_polygon = False
            self.drag_initial_vertices.clear()
        self._original_mouse_release(event)

    def undo_last_action(self):
        if self.mode == "polygon" and self.polygon_points:
            self.polygon_points.pop()
            if self.polygon_preview_items:
                self.viewer.scene().removeItem(self.polygon_preview_items.pop())
            self.draw_polygon_preview()
        elif self.mode == "sam_points" and self.point_items:
            item_to_remove = self.point_items.pop()
            point_pos = item_to_remove.rect().topLeft() + QPointF(4, 4)
            point_coords = [int(point_pos.x()), int(point_pos.y())]
            if point_coords in self.positive_points:
                self.positive_points.remove(point_coords)
            elif point_coords in self.negative_points:
                self.negative_points.remove(point_coords)
            self.viewer.scene().removeItem(item_to_remove)
            self.update_segmentation()

    def finalize_polygon(self):
        if len(self.polygon_points) < 3:
            return
        if self.rubber_band_line:
            self.viewer.scene().removeItem(self.rubber_band_line)
            self.rubber_band_line = None
        self.segments.append(
            {
                "vertices": list(self.polygon_points),
                "type": "Polygon",
                "mask": None,
                "class_id": self.next_class_id,
            }
        )
        self.next_class_id += 1
        self.polygon_points.clear()
        for item in self.polygon_preview_items:
            self.viewer.scene().removeItem(item)
        self.polygon_preview_items.clear()
        self.update_all_lists()

    def handle_segment_selection_click(self, pos):
        x, y = int(pos.x()), int(pos.y())
        for i in range(len(self.segments) - 1, -1, -1):
            seg = self.segments[i]
            mask = (
                self.rasterize_polygon(seg["vertices"])
                if seg["type"] == "Polygon"
                else seg.get("mask")
            )
            if (
                mask is not None
                and y < mask.shape[0]
                and x < mask.shape[1]
                and mask[y, x]
            ):
                for j in range(self.right_panel.segment_table.rowCount()):
                    item = self.right_panel.segment_table.item(j, 0)
                    if item and item.data(Qt.ItemDataRole.UserRole) == i:
                        table = self.right_panel.segment_table
                        is_selected = table.item(j, 0).isSelected()
                        range_to_select = QTableWidgetSelectionRange(
                            j, 0, j, table.columnCount() - 1
                        )
                        table.setRangeSelected(range_to_select, not is_selected)
                        return
        self.viewer.setFocus()

    def assign_selected_to_class(self):
        selected_indices = self.get_selected_segment_indices()
        if not selected_indices:
            return
        target_class_id = self.segments[selected_indices[0]]["class_id"]
        for i in selected_indices:
            self.segments[i]["class_id"] = target_class_id
        self.update_all_lists()
        self.viewer.setFocus()

    def rasterize_polygon(self, vertices):
        if not vertices or self.viewer._pixmap_item.pixmap().isNull():
            return None
        h, w = (
            self.viewer._pixmap_item.pixmap().height(),
            self.viewer._pixmap_item.pixmap().width(),
        )
        points_np = np.array([[p.x(), p.y()] for p in vertices], dtype=np.int32)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [points_np], 1)
        return mask.astype(bool)

    def display_all_segments(self):
        for i, items in self.segment_items.items():
            for item in items:
                self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        selected_indices = self.get_selected_segment_indices()

        unique_class_ids = sorted(
            list(
                {
                    seg.get("class_id")
                    for seg in self.segments
                    if seg.get("class_id") is not None
                }
            )
        )
        num_classes = len(unique_class_ids) if unique_class_ids else 1
        class_id_to_hue_index = {
            class_id: i for i, class_id in enumerate(unique_class_ids)
        }

        for i, seg_dict in enumerate(self.segments):
            self.segment_items[i] = []
            class_id = seg_dict.get("class_id", 0)

            hue_index = class_id_to_hue_index.get(class_id, 0)
            hue = int((hue_index * 360 / num_classes)) % 360
            base_color = QColor.fromHsv(hue, 220, 220)

            if seg_dict["type"] == "Polygon":
                poly_item = HoverablePolygonItem(QPolygonF(seg_dict["vertices"]))
                default_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
                )
                hover_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
                poly_item.set_brushes(default_brush, hover_brush)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                self.viewer.scene().addItem(poly_item)
                self.segment_items[i].append(poly_item)
                vertex_color = QBrush(base_color)
                for v in seg_dict["vertices"]:
                    dot = QGraphicsEllipseItem(v.x() - 3, v.y() - 3, 6, 6)
                    dot.setBrush(vertex_color)
                    self.viewer.scene().addItem(dot)
                    self.segment_items[i].append(dot)
                if self.mode == "edit" and i in selected_indices:
                    for idx, v in enumerate(seg_dict["vertices"]):
                        vertex_item = EditableVertexItem(self, i, idx, -4, -4, 8, 8)
                        vertex_item.setPos(v)
                        self.viewer.scene().addItem(vertex_item)
                        self.segment_items[i].append(vertex_item)
            elif seg_dict.get("mask") is not None:
                pixmap = mask_to_pixmap(seg_dict["mask"], base_color.getRgb()[:3])
                pixmap_item = self.viewer.scene().addPixmap(pixmap)
                pixmap_item.setZValue(i + 1)
                self.segment_items[i].append(pixmap_item)
        self.highlight_selected_segments()

    def update_vertex_pos(self, seg_idx, vtx_idx, new_pos):
        self.segments[seg_idx]["vertices"][vtx_idx] = new_pos
        self.update_polygon_visuals(seg_idx)

    def update_polygon_visuals(self, segment_index):
        items = self.segment_items.get(segment_index, [])
        for item in items:
            if isinstance(item, HoverablePolygonItem):
                item.setPolygon(QPolygonF(self.segments[segment_index]["vertices"]))
                break

    def highlight_selected_segments(self):
        if hasattr(self, "highlight_items"):
            for item in self.highlight_items:
                self.viewer.scene().removeItem(item)
        self.highlight_items.clear()
        selected_indices = self.get_selected_segment_indices()
        for i in selected_indices:
            seg = self.segments[i]
            mask = (
                self.rasterize_polygon(seg["vertices"])
                if seg["type"] == "Polygon"
                else seg.get("mask")
            )
            if mask is not None:
                pixmap = mask_to_pixmap(mask, (255, 255, 255))
                highlight_item = self.viewer.scene().addPixmap(pixmap)
                highlight_item.setZValue(100)
                self.highlight_items.append(highlight_item)

    def update_all_lists(self):
        self.update_class_filter_combo()
        self.update_segment_table()
        self.update_class_list()
        self.display_all_segments()

    def update_segment_table(self):
        table = self.right_panel.segment_table
        table.blockSignals(True)
        selected_indices = self.get_selected_segment_indices()
        table.clearContents()
        table.setRowCount(0)
        filter_text = self.right_panel.class_filter_combo.currentText()
        show_all = filter_text == "All Classes"
        filter_class_id = -1
        if not show_all:
            try:
                filter_class_id = int(filter_text.split(" ")[1])
            except (ValueError, IndexError):
                pass

        display_segments = []
        for i, seg in enumerate(self.segments):
            if show_all or seg.get("class_id") == filter_class_id:
                display_segments.append((i, seg))

        table.setRowCount(len(display_segments))

        unique_class_ids = sorted(
            list(
                {
                    s.get("class_id")
                    for s in self.segments
                    if s.get("class_id") is not None
                }
            )
        )
        num_classes = len(unique_class_ids) if unique_class_ids else 1
        class_id_to_hue_index = {cid: i for i, cid in enumerate(unique_class_ids)}

        for row, (original_index, seg) in enumerate(display_segments):
            class_id = seg.get("class_id", 0)
            hue_index = class_id_to_hue_index.get(class_id, 0)
            hue = int((hue_index * 360 / num_classes)) % 360
            color = QColor.fromHsv(hue, 150, 100)

            index_item = NumericTableWidgetItem(str(original_index + 1))
            class_item = NumericTableWidgetItem(str(class_id))
            type_item = QTableWidgetItem(seg["type"])

            index_item.setFlags(index_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            type_item.setFlags(type_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            index_item.setData(Qt.ItemDataRole.UserRole, original_index)

            table.setItem(row, 0, index_item)
            table.setItem(row, 1, class_item)
            table.setItem(row, 2, type_item)
            for col in range(3):
                table.item(row, col).setBackground(QBrush(color))

        table.setSortingEnabled(False)
        for row in range(table.rowCount()):
            if table.item(row, 0).data(Qt.ItemDataRole.UserRole) in selected_indices:
                table.selectRow(row)
        table.setSortingEnabled(True)

        table.blockSignals(False)
        self.viewer.setFocus()

    def update_class_list(self):
        class_table = self.right_panel.class_table
        class_table.blockSignals(True)

        unique_class_ids = sorted(
            list(
                {
                    seg.get("class_id")
                    for seg in self.segments
                    if seg.get("class_id") is not None
                }
            )
        )
        class_table.setRowCount(len(unique_class_ids))

        num_classes = len(unique_class_ids) if unique_class_ids else 1
        class_id_to_hue_index = {cid: i for i, cid in enumerate(unique_class_ids)}

        for row, cid in enumerate(unique_class_ids):
            item = QTableWidgetItem(str(cid))
            item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            hue_index = class_id_to_hue_index.get(cid, 0)
            hue = int((hue_index * 360 / num_classes)) % 360
            color = QColor.fromHsv(hue, 150, 100)
            item.setBackground(QBrush(color))
            class_table.setItem(row, 0, item)

        class_table.blockSignals(False)

    def update_class_filter_combo(self):
        combo = self.right_panel.class_filter_combo
        unique_class_ids = sorted(
            list(
                {
                    seg.get("class_id")
                    for seg in self.segments
                    if seg.get("class_id") is not None
                }
            )
        )
        current_selection = combo.currentText()
        combo.blockSignals(True)
        combo.clear()
        combo.addItem("All Classes")
        combo.addItems([f"Class {cid}" for cid in unique_class_ids])
        if combo.findText(current_selection) > -1:
            combo.setCurrentText(current_selection)
        else:
            combo.setCurrentIndex(0)
        combo.blockSignals(False)

    def reassign_class_ids(self):
        class_table = self.right_panel.class_table
        ordered_ids = [
            int(class_table.item(row, 0).text())
            for row in range(class_table.rowCount())
            if class_table.item(row, 0) is not None
        ]
        id_map = {old_id: new_id for new_id, old_id in enumerate(ordered_ids)}
        for seg in self.segments:
            old_id = seg.get("class_id")
            if old_id in id_map:
                seg["class_id"] = id_map[old_id]
        self.next_class_id = len(ordered_ids)
        self.update_all_lists()
        self.viewer.setFocus()

    def handle_class_id_change(self, item):
        if item.column() != 1:
            return
        table = self.right_panel.segment_table
        table.blockSignals(True)
        try:
            new_class_id = int(item.text())
            original_index = table.item(item.row(), 0).data(Qt.ItemDataRole.UserRole)
            self.segments[original_index]["class_id"] = new_class_id
            if new_class_id >= self.next_class_id:
                self.next_class_id = new_class_id + 1
            self.update_all_lists()
        except (ValueError, TypeError):
            original_index = table.item(item.row(), 0).data(Qt.ItemDataRole.UserRole)
            item.setText(str(self.segments[original_index]["class_id"]))
        table.blockSignals(False)
        self.viewer.setFocus()

    def get_selected_segment_indices(self):
        table = self.right_panel.segment_table
        selected_items = table.selectedItems()
        selected_rows = sorted(list({item.row() for item in selected_items}))
        return [
            table.item(row, 0).data(Qt.ItemDataRole.UserRole)
            for row in selected_rows
            if table.item(row, 0)
        ]

    def save_output_to_npz(self):
        if not self.segments or not self.current_image_path:
            return
        self.right_panel.status_label.setText("Saving...")
        QApplication.processEvents()

        output_path = os.path.splitext(self.current_image_path)[0] + ".npz"
        h, w = (
            self.viewer._pixmap_item.pixmap().height(),
            self.viewer._pixmap_item.pixmap().width(),
        )
        unique_class_ids = sorted(
            list(
                {
                    seg["class_id"]
                    for seg in self.segments
                    if seg.get("class_id") is not None
                }
            )
        )
        if not unique_class_ids:
            self.right_panel.status_label.setText("Save failed: No classes.")
            QTimer.singleShot(3000, lambda: self.right_panel.status_label.clear())
            return

        id_map = {old_id: new_id for new_id, old_id in enumerate(unique_class_ids)}
        num_final_classes = len(unique_class_ids)
        final_mask_tensor = np.zeros((h, w, num_final_classes), dtype=np.uint8)

        for seg in self.segments:
            class_id = seg.get("class_id")
            if class_id not in id_map:
                continue
            new_channel_idx = id_map[class_id]
            mask = (
                self.rasterize_polygon(seg["vertices"])
                if seg["type"] == "Polygon"
                else seg.get("mask")
            )
            if mask is not None:
                final_mask_tensor[:, :, new_channel_idx] = np.logical_or(
                    final_mask_tensor[:, :, new_channel_idx], mask
                )

        np.savez_compressed(output_path, mask=final_mask_tensor.astype(np.uint8))
        self.file_model.setRootPath(self.file_model.rootPath())

        self.right_panel.status_label.setText("Saved!")
        QTimer.singleShot(3000, lambda: self.right_panel.status_label.clear())

    def save_current_segment(self):
        if (
            self.mode != "sam_points"
            or not hasattr(self, "preview_mask_item")
            or not self.preview_mask_item
        ):
            return
        mask = self.sam_model.predict(self.positive_points, self.negative_points)
        if mask is not None:
            self.segments.append(
                {
                    "mask": mask,
                    "type": "SAM",
                    "vertices": None,
                    "class_id": self.next_class_id,
                }
            )
            self.next_class_id += 1
            self.clear_all_points()
            self.update_all_lists()

    def delete_selected_segments(self):
        selected_indices = self.get_selected_segment_indices()
        if not selected_indices:
            return
        for i in sorted(selected_indices, reverse=True):
            del self.segments[i]
        self.update_all_lists()
        self.viewer.setFocus()

    def load_existing_mask(self):
        if not self.current_image_path:
            return
        npz_path = os.path.splitext(self.current_image_path)[0] + ".npz"
        if os.path.exists(npz_path):
            with np.load(npz_path) as data:
                if "mask" in data:
                    mask_data = data["mask"]
                    if mask_data.ndim == 2:
                        mask_data = np.expand_dims(mask_data, axis=-1)
                    num_classes = mask_data.shape[2]
                    for i in range(num_classes):
                        class_mask = mask_data[:, :, i].astype(bool)
                        if np.any(class_mask):
                            self.segments.append(
                                {
                                    "mask": class_mask,
                                    "type": "Loaded",
                                    "vertices": None,
                                    "class_id": i,
                                }
                            )
                    self.next_class_id = num_classes
            self.update_all_lists()

    def add_point(self, pos, positive):
        point_list = self.positive_points if positive else self.negative_points
        point_list.append([int(pos.x()), int(pos.y())])
        color = Qt.GlobalColor.green if positive else Qt.GlobalColor.red
        point_item = QGraphicsEllipseItem(pos.x() - 4, pos.y() - 4, 8, 8)
        point_item.setBrush(QBrush(color))
        point_item.setPen(QPen(Qt.GlobalColor.white))
        self.viewer.scene().addItem(point_item)
        self.point_items.append(point_item)

    def update_segmentation(self):
        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            self.viewer.scene().removeItem(self.preview_mask_item)
        if not self.positive_points:
            return
        mask = self.sam_model.predict(self.positive_points, self.negative_points)
        if mask is not None:
            pixmap = mask_to_pixmap(mask, (255, 255, 0))
            self.preview_mask_item = self.viewer.scene().addPixmap(pixmap)
            self.preview_mask_item.setZValue(50)

    def clear_all_points(self):
        if self.rubber_band_line:
            self.viewer.scene().removeItem(self.rubber_band_line)
            self.rubber_band_line = None
        self.positive_points.clear()
        self.negative_points.clear()
        for item in self.point_items:
            self.viewer.scene().removeItem(item)
        self.point_items.clear()
        self.polygon_points.clear()
        for item in self.polygon_preview_items:
            self.viewer.scene().removeItem(item)
        self.polygon_preview_items.clear()
        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            self.viewer.scene().removeItem(self.preview_mask_item)
            self.preview_mask_item = None

    def handle_polygon_click(self, pos):
        if self.polygon_points and (
            (
                (pos.x() - self.polygon_points[0].x()) ** 2
                + (pos.y() - self.polygon_points[0].y()) ** 2
            )
            < 25
        ):
            if len(self.polygon_points) > 2:
                self.finalize_polygon()
            return
        self.polygon_points.append(pos)
        dot = QGraphicsEllipseItem(pos.x() - 2, pos.y() - 2, 4, 4)
        dot.setBrush(QBrush(Qt.GlobalColor.blue))
        dot.setPen(QPen(Qt.GlobalColor.cyan))
        self.viewer.scene().addItem(dot)
        self.polygon_preview_items.append(dot)
        self.draw_polygon_preview()

    def draw_polygon_preview(self):
        if self.rubber_band_line:
            self.viewer.scene().removeItem(self.rubber_band_line)
            self.rubber_band_line = None
        for item in self.polygon_preview_items:
            if not isinstance(item, QGraphicsEllipseItem):
                self.viewer.scene().removeItem(item)
        self.polygon_preview_items = [
            item
            for item in self.polygon_preview_items
            if isinstance(item, QGraphicsEllipseItem)
        ]

        if len(self.polygon_points) > 2:
            preview_poly = QGraphicsPolygonItem(QPolygonF(self.polygon_points))
            preview_poly.setBrush(QBrush(QColor(0, 255, 255, 100)))
            preview_poly.setPen(QPen(Qt.GlobalColor.transparent))
            self.viewer.scene().addItem(preview_poly)
            self.polygon_preview_items.append(preview_poly)

        if len(self.polygon_points) > 1:
            for i in range(len(self.polygon_points) - 1):
                line = QGraphicsLineItem(
                    self.polygon_points[i].x(),
                    self.polygon_points[i].y(),
                    self.polygon_points[i + 1].x(),
                    self.polygon_points[i + 1].y(),
                )
                line.setPen(QPen(Qt.GlobalColor.cyan, 2))
                self.viewer.scene().addItem(line)
                self.polygon_preview_items.append(line)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    qdarktheme.setup_theme()
    main_win = MainWindow()
    main_win.show()
    sys.exit(app.exec())
