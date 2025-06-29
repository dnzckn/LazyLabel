from unittest.mock import MagicMock, patch

import pytest

from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model."""
    mock_model = MagicMock()
    mock_model.is_loaded = True
    mock_model.device = "CPU"
    return mock_model


@pytest.fixture
def main_window(qtbot, mock_sam_model):
    """Fixture for MainWindow with mocked model loading."""
    with (
        patch(
            "lazylabel.core.model_manager.ModelManager.initialize_default_model"
        ) as mock_init,
        patch(
            "lazylabel.core.model_manager.ModelManager.get_available_models"
        ) as mock_get_models,
        patch(
            "lazylabel.core.model_manager.ModelManager.is_model_available"
        ) as mock_is_available,
    ):
        # Setup mocks to avoid expensive model loading
        mock_init.return_value = mock_sam_model
        mock_get_models.return_value = [
            ("Mock Model 1", "/path/to/model1"),
            ("Mock Model 2", "/path/to/model2"),
        ]
        mock_is_available.return_value = True

        # Create MainWindow with mocked model loading
        window = MainWindow()
        qtbot.addWidget(window)
        return window


def test_open_folder_button_exists(main_window):
    """Test that the open folder button exists in the right panel."""
    assert hasattr(main_window.right_panel, "btn_open_folder")
    assert main_window.right_panel.btn_open_folder is not None
    assert main_window.right_panel.btn_open_folder.text() == "Open Image Folder"


def test_open_folder_signal_connection(main_window):
    """Test that the open folder signal is properly connected."""
    # Check that the signal is connected by verifying the callback exists
    assert hasattr(main_window, "_open_folder_dialog")

    # Test that the signal is properly connected by checking the connection exists
    # We can't easily test the exact call timing, but we can verify the signal chain works
    # by testing the signal emission (which we do in other tests)

    # Verify that the right panel has the signal and the main window has the handler
    assert hasattr(main_window.right_panel, "open_folder_requested")
    assert callable(main_window._open_folder_dialog)

    # This test is implicitly verified by the end-to-end test working


def test_open_folder_signal_emission(main_window, qtbot):
    """Test that the button click emits the open_folder_requested signal."""
    # Temporarily disconnect the signal to prevent dialog from opening
    main_window.right_panel.open_folder_requested.disconnect()

    try:
        # Use qtbot to capture signal emission
        with qtbot.waitSignal(
            main_window.right_panel.open_folder_requested, timeout=100
        ):
            main_window.right_panel.btn_open_folder.click()
    finally:
        # Reconnect the signal
        main_window.right_panel.open_folder_requested.connect(
            main_window._open_folder_dialog
        )


@patch("PyQt6.QtWidgets.QFileDialog.getExistingDirectory")
def test_open_folder_dialog_success(mock_dialog, main_window, qtbot):
    """Test that the open folder dialog works when a folder is selected."""
    # Mock folder selection
    test_folder = "/test/folder/path"
    mock_dialog.return_value = test_folder

    # Mock the right panel set_folder method
    main_window.right_panel.set_folder = MagicMock()

    # Call the open folder dialog
    main_window._open_folder_dialog()

    # Verify dialog was called
    mock_dialog.assert_called_once_with(main_window, "Select Image Folder")

    # Verify set_folder was called with correct parameters
    main_window.right_panel.set_folder.assert_called_once_with(
        test_folder, main_window.file_model
    )


@patch("PyQt6.QtWidgets.QFileDialog.getExistingDirectory")
def test_open_folder_dialog_cancel(mock_dialog, main_window, qtbot):
    """Test that the open folder dialog handles cancellation properly."""
    # Mock folder selection cancellation (empty string)
    mock_dialog.return_value = ""

    # Mock the right panel set_folder method
    main_window.right_panel.set_folder = MagicMock()

    # Call the open folder dialog
    main_window._open_folder_dialog()

    # Verify dialog was called
    mock_dialog.assert_called_once_with(main_window, "Select Image Folder")

    # Verify set_folder was NOT called
    main_window.right_panel.set_folder.assert_not_called()


def test_file_model_setup(main_window):
    """Test that the file model is properly set up."""
    assert hasattr(main_window, "file_model")
    assert main_window.file_model is not None

    # Test that the right panel has the file model set up
    assert main_window.right_panel.file_tree.model() == main_window.file_model


def test_set_folder_functionality(main_window, qtbot):
    """Test that the set_folder method works correctly."""
    test_folder = "/test/folder"

    # Mock the file model setRootPath method
    main_window.file_model.setRootPath = MagicMock()
    main_window.right_panel.file_tree.setRootIndex = MagicMock()

    # Call set_folder
    main_window.right_panel.set_folder(test_folder, main_window.file_model)

    # Verify the methods were called
    main_window.file_model.setRootPath.assert_called_once_with(test_folder)


def test_open_folder_integration(main_window, qtbot):
    """Test the complete open folder workflow without opening real dialogs."""
    import tempfile

    # Create a temporary directory for testing
    with (
        tempfile.TemporaryDirectory() as temp_dir,
        patch("PyQt6.QtWidgets.QFileDialog.getExistingDirectory") as mock_dialog,
    ):
        mock_dialog.return_value = temp_dir

        # Call the open folder dialog
        main_window._open_folder_dialog()

        # Verify dialog was called
        mock_dialog.assert_called_once_with(main_window, "Select Image Folder")

        # Verify the file tree root path was set (indirectly)
        # This tests that set_folder was called and executed without errors
        assert True  # If we get here without exceptions, the integration works


def test_open_folder_end_to_end(main_window, qtbot):
    """Test the complete end-to-end workflow from button click to folder setting."""
    import tempfile

    # Create a temporary directory for testing
    with (
        tempfile.TemporaryDirectory() as temp_dir,
        patch("PyQt6.QtWidgets.QFileDialog.getExistingDirectory") as mock_dialog,
    ):
        mock_dialog.return_value = temp_dir

        # Mock the set_folder method to verify it's called
        original_set_folder = main_window.right_panel.set_folder
        main_window.right_panel.set_folder = MagicMock()

        # Use qtbot to wait for the signal and trigger the workflow
        with qtbot.waitSignal(
            main_window.right_panel.open_folder_requested, timeout=100
        ):
            main_window.right_panel.btn_open_folder.click()

        # Process Qt events to ensure signals are handled
        from PyQt6.QtWidgets import QApplication

        QApplication.processEvents()

        # Give the system a moment to process the signal-slot connection
        qtbot.wait(10)

        # Verify the dialog was called
        mock_dialog.assert_called_once_with(main_window, "Select Image Folder")

        # Verify set_folder was called with the selected folder
        main_window.right_panel.set_folder.assert_called_once_with(
            temp_dir, main_window.file_model
        )

        # Restore original method
        main_window.right_panel.set_folder = original_set_folder
