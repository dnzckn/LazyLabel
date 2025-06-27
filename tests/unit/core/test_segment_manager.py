"""Unit tests for the SegmentManager class."""

from PyQt6.QtCore import QPointF

from lazylabel.core.segment_manager import SegmentManager


class TestSegmentManager:
    """Tests for the SegmentManager class."""

    def test_init(self):
        """Test initialization of SegmentManager."""
        manager = SegmentManager()
        assert manager.segments == []
        assert manager.class_aliases == {}
        assert manager.next_class_id == 0
        assert manager.active_class_id is None

    def test_add_segment(self):
        """Test adding a segment."""
        manager = SegmentManager()
        segment = {
            "type": "Polygon",
            "vertices": [QPointF(0, 0), QPointF(10, 0), QPointF(10, 10)],
        }
        manager.add_segment(segment)

        assert len(manager.segments) == 1
        assert manager.segments[0]["class_id"] == 0
        assert manager.next_class_id == 1

    def test_add_segment_with_active_class(self):
        """Test adding a segment with an active class."""
        manager = SegmentManager()
        manager.set_active_class(5)
        segment = {
            "type": "Polygon",
            "vertices": [QPointF(0, 0), QPointF(10, 0), QPointF(10, 10)],
        }
        manager.add_segment(segment)

        assert len(manager.segments) == 1
        assert manager.segments[0]["class_id"] == 5
        assert manager.next_class_id == 6

    def test_delete_segments(self):
        """Test deleting segments."""
        manager = SegmentManager()
        manager.add_segment({"type": "Polygon", "vertices": []})
        manager.add_segment({"type": "Polygon", "vertices": []})
        manager.add_segment({"type": "Polygon", "vertices": []})

        assert len(manager.segments) == 3

        manager.delete_segments([1])
        assert len(manager.segments) == 2

        manager.delete_segments([0, 1])
        assert len(manager.segments) == 0

    def test_assign_segments_to_class(self):
        """Test assigning segments to a class."""
        manager = SegmentManager()
        manager.add_segment({"type": "Polygon", "vertices": []})
        manager.add_segment({"type": "Polygon", "vertices": []})
        manager.add_segment({"type": "Polygon", "vertices": []})

        # Initially all segments should have class_id 0, 1, 2
        assert manager.segments[0]["class_id"] == 0
        assert manager.segments[1]["class_id"] == 1
        assert manager.segments[2]["class_id"] == 2

        # Assign segments 0 and 2 to the same class (should use the minimum class_id)
        manager.assign_segments_to_class([0, 2])

        assert manager.segments[0]["class_id"] == 0
        assert manager.segments[1]["class_id"] == 1
        assert manager.segments[2]["class_id"] == 0

    def test_get_unique_class_ids(self):
        """Test getting unique class IDs."""
        manager = SegmentManager()
        manager.add_segment({"class_id": 5})
        manager.add_segment({"class_id": 2})
        manager.add_segment({"class_id": 5})

        unique_ids = manager.get_unique_class_ids()
        assert unique_ids == [2, 5]

    def test_rasterize_polygon(self):
        """Test rasterizing a polygon."""
        manager = SegmentManager()
        vertices = [QPointF(1, 1), QPointF(3, 1), QPointF(3, 3), QPointF(1, 3)]
        image_size = (5, 5)

        mask = manager.rasterize_polygon(vertices, image_size)

        # Check that the mask has the correct shape
        assert mask.shape == image_size

        # Check that the polygon area is filled with True
        assert mask[1:4, 1:4].all()

        # Check that the outside area is False
        assert not mask[0, 0]
        assert not mask[4, 4]

    def test_create_final_mask_tensor(self):
        """Test creating the final mask tensor."""
        manager = SegmentManager()

        # Add two segments with different class IDs
        vertices1 = [QPointF(1, 1), QPointF(3, 1), QPointF(3, 3), QPointF(1, 3)]
        manager.add_segment({"type": "Polygon", "vertices": vertices1, "class_id": 0})

        vertices2 = [QPointF(2, 2), QPointF(4, 2), QPointF(4, 4), QPointF(2, 4)]
        manager.add_segment({"type": "Polygon", "vertices": vertices2, "class_id": 1})

        image_size = (5, 5)
        class_order = [0, 1]

        mask_tensor = manager.create_final_mask_tensor(image_size, class_order)

        # Check that the mask tensor has the correct shape
        assert mask_tensor.shape == (5, 5, 2)

        # Check that the first channel has the first polygon
        assert mask_tensor[2, 2, 0]  # Inside first polygon
        assert not mask_tensor[4, 4, 0]  # Outside first polygon

        # Check that the second channel has the second polygon
        assert mask_tensor[3, 3, 1]  # Inside second polygon
        assert not mask_tensor[0, 0, 1]  # Outside second polygon

    def test_class_aliases(self):
        """Test class alias functionality."""
        manager = SegmentManager()

        # Set aliases
        manager.set_class_alias(0, "Background")
        manager.set_class_alias(1, "Object")

        # Check aliases
        assert manager.get_class_alias(0) == "Background"
        assert manager.get_class_alias(1) == "Object"
        assert manager.get_class_alias(2) == "2"  # Default to string of class_id

    def test_toggle_active_class(self):
        """Test toggling the active class."""
        manager = SegmentManager()

        # Initially no active class
        assert manager.active_class_id is None

        # Toggle class 1 to active
        result = manager.toggle_active_class(1)
        assert result is True
        assert manager.active_class_id == 1

        # Toggle class 1 again to deactivate
        result = manager.toggle_active_class(1)
        assert result is False
        assert manager.active_class_id is None

        # Toggle class 2 to active
        result = manager.toggle_active_class(2)
        assert result is True
        assert manager.active_class_id == 2
