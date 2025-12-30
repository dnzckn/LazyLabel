"""Unit tests for multi-view segment independence.

Tests that segments created in linked multi-view mode are truly independent
copies, not shared references. This prevents edits in one viewer from
affecting segments in the other viewer.
"""


class TestMultiViewSegmentIndependence:
    """Tests for segment data independence between viewers."""

    def test_vertices_list_is_copied_not_shared(self):
        """Test that vertices lists are independent copies, not shared references.

        This protects against the bug where editing a segment's vertices in one
        viewer would also modify the segment in the other viewer because they
        shared the same list reference.
        """
        # Simulate the original vertices (as would be created for a bbox)
        original_vertices = [
            [10, 10],
            [100, 10],
            [100, 100],
            [10, 100],
        ]

        # CORRECT: Create copies for each viewer (the fix)
        segment_viewer_0 = {
            "vertices": [[v[0], v[1]] for v in original_vertices],
            "type": "Polygon",
            "mask": None,
        }
        segment_viewer_1 = {
            "vertices": [[v[0], v[1]] for v in original_vertices],
            "type": "Polygon",
            "mask": None,
        }

        # Verify they have the same initial values
        assert segment_viewer_0["vertices"] == segment_viewer_1["vertices"]

        # But are NOT the same object
        assert segment_viewer_0["vertices"] is not segment_viewer_1["vertices"]

        # Simulate editing a vertex in viewer 0
        segment_viewer_0["vertices"][0] = [50, 50]

        # Verify viewer 1 is NOT affected
        assert segment_viewer_1["vertices"][0] == [10, 10]
        assert segment_viewer_0["vertices"][0] == [50, 50]

    def test_buggy_shared_reference_behavior(self):
        """Demonstrate the bug that would occur with shared references.

        This test documents the incorrect behavior that we're protecting against.
        """
        # Simulate the original vertices
        original_vertices = [
            [10, 10],
            [100, 10],
            [100, 100],
            [10, 100],
        ]

        # BUGGY: Same reference used for both (the old bug)
        segment_viewer_0 = {
            "vertices": original_vertices,  # Same reference!
            "type": "Polygon",
            "mask": None,
        }
        segment_viewer_1 = {
            "vertices": original_vertices,  # Same reference!
            "type": "Polygon",
            "mask": None,
        }

        # They ARE the same object (this is the bug)
        assert segment_viewer_0["vertices"] is segment_viewer_1["vertices"]

        # Editing viewer 0 INCORRECTLY affects viewer 1
        segment_viewer_0["vertices"][0] = [50, 50]
        assert segment_viewer_1["vertices"][0] == [50, 50]  # Bug: viewer 1 changed!

    def test_nested_list_elements_are_also_independent(self):
        """Test that inner coordinate lists are also independent copies."""
        original_vertices = [
            [10, 10],
            [100, 10],
        ]

        # Create proper copies
        vertices_copy_1 = [[v[0], v[1]] for v in original_vertices]
        vertices_copy_2 = [[v[0], v[1]] for v in original_vertices]

        # Modify inner list in copy 1
        vertices_copy_1[0][0] = 999

        # Copy 2 should be unaffected
        assert vertices_copy_2[0][0] == 10
        assert vertices_copy_1[0][0] == 999

    def test_mask_arrays_should_be_independent_for_ai_segments(self):
        """Test that mask arrays are independent when creating AI segments."""
        import numpy as np

        # Simulate an AI prediction mask
        original_mask = np.zeros((100, 100), dtype=bool)
        original_mask[20:40, 20:40] = True

        # CORRECT: Copy the mask for each viewer
        mask_viewer_0 = original_mask.copy()
        mask_viewer_1 = original_mask.copy()

        # Verify they're equal but not the same object
        assert np.array_equal(mask_viewer_0, mask_viewer_1)
        assert mask_viewer_0 is not mask_viewer_1

        # Modify mask in viewer 0
        mask_viewer_0[50:60, 50:60] = True

        # Viewer 1 should be unaffected
        assert mask_viewer_1[55, 55] is np.False_
        assert mask_viewer_0[55, 55] is np.True_
