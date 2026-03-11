"""Worker thread for AI-based reference frame suggestion.

Embeds all timeline images with MobileNetV3, clusters with HDBSCAN,
and selects medoid frames as suggested references for labeling.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PyQt6.QtCore import QThread, pyqtSignal

from ...config.paths import Paths
from ...utils.logger import logger

_MOBILENET_FILENAME = "mobilenetv3_small_100.pth"


class ReferenceFinderWorker(QThread):
    """Worker that identifies diverse representative frames in a sequence.

    Uses MobileNetV3 small (via timm) for embedding, HDBSCAN for clustering,
    and medoid selection for representative frame identification.

    Signals:
        progress: Status message for UI feedback
        finished_analysis: List of suggested frame indices (0-indexed)
        error: Error message if analysis fails
    """

    progress = pyqtSignal(str)
    finished_analysis = pyqtSignal(list)
    error = pyqtSignal(str)

    _BATCH_SIZE = 32

    def __init__(self, image_paths: list[str], parent=None):
        super().__init__(parent)
        self.image_paths = list(image_paths)
        self._should_stop = False

    def stop(self) -> None:
        """Request the worker to stop."""
        self._should_stop = True

    def run(self) -> None:
        """Run embedding, clustering, and medoid selection."""
        try:
            self._run_analysis()
        except Exception as e:
            logger.error(f"ReferenceFinderWorker: {e}")
            if not self._should_stop:
                self.error.emit(str(e))

    def _run_analysis(self) -> None:
        import timm
        import timm.data
        import torch
        from sklearn.cluster import HDBSCAN

        if self._should_stop:
            return

        n_images = len(self.image_paths)

        # --- Load model (cached locally for offline use) ---
        models_dir = Paths().models_dir
        local_path = models_dir / _MOBILENET_FILENAME

        if local_path.exists():
            self.progress.emit("Loading MobileNetV3 model...")
            try:
                model = timm.create_model(
                    "mobilenetv3_small_100", pretrained=False, num_classes=0
                )
                state_dict = torch.load(
                    local_path, map_location="cpu", weights_only=True
                )
                model.load_state_dict(state_dict)
            except Exception as e:
                logger.warning(
                    f"ReferenceFinderWorker: Cached model corrupt, re-downloading: {e}"
                )
                local_path.unlink(missing_ok=True)
                # Fall through to download path below

        if not local_path.exists():
            self.progress.emit("Downloading MobileNetV3 model (one-time)...")
            try:
                model = timm.create_model(
                    "mobilenetv3_small_100", pretrained=True, num_classes=0
                )
            except Exception as e:
                self.error.emit(
                    f"Failed to download MobileNetV3 model: {e}\n\n"
                    "Model source: https://huggingface.co/timm/"
                    "mobilenetv3_small_100.lamb_in1k\n\n"
                    "To install manually, run on a machine with internet:\n"
                    '  python -c "import timm, torch; m = timm.create_model('
                    "'mobilenetv3_small_100', pretrained=True, num_classes=0);"
                    f" torch.save(m.state_dict(), 'mobilenetv3_small_100.pth')\"\n"
                    f"Then copy mobilenetv3_small_100.pth to:\n  {models_dir}"
                )
                return
            models_dir.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), local_path)
            logger.info(f"ReferenceFinderWorker: Cached MobileNetV3 to {local_path}")

        model.eval()

        data_config = timm.data.resolve_model_data_config(model)
        transform = timm.data.create_transform(**data_config, is_training=False)

        if self._should_stop:
            return

        # --- Embed all images ---
        from PIL import Image

        embeddings = []
        valid_indices = []  # Track which frames produced valid embeddings

        for i in range(0, n_images, self._BATCH_SIZE):
            if self._should_stop:
                return

            batch_end = min(i + self._BATCH_SIZE, n_images)
            self.progress.emit(f"Embedding frames {i + 1}-{batch_end}/{n_images}")

            batch_tensors = []
            batch_indices = []

            for j in range(i, batch_end):
                if self._should_stop:
                    return
                try:
                    img = Image.open(self.image_paths[j]).convert("RGB")
                    tensor = transform(img)
                    batch_tensors.append(tensor)
                    batch_indices.append(j)
                except Exception as e:
                    logger.warning(
                        f"ReferenceFinderWorker: Failed to load "
                        f"{Path(self.image_paths[j]).name}: {e}"
                    )

            if not batch_tensors:
                continue

            batch = torch.stack(batch_tensors)
            with torch.no_grad():
                features = model(batch).numpy()

            # L2-normalize
            norms = np.linalg.norm(features, axis=1, keepdims=True)
            norms = np.maximum(norms, 1e-8)
            features = features / norms

            embeddings.append(features)
            valid_indices.extend(batch_indices)

        if self._should_stop:
            return

        if not embeddings:
            self.error.emit("No images could be loaded for analysis")
            return

        all_embeddings = np.vstack(embeddings)
        logger.info(
            f"ReferenceFinderWorker: Embedded {len(valid_indices)} images, "
            f"shape {all_embeddings.shape}"
        )

        # --- Cluster with HDBSCAN ---
        self.progress.emit("Clustering frames...")

        min_cluster_size = max(5, n_images // 100)
        clusterer = HDBSCAN(
            min_cluster_size=min_cluster_size, metric="euclidean", copy=True
        )
        labels = clusterer.fit_predict(all_embeddings)

        if self._should_stop:
            return

        # --- Determine budget ---
        budget = max(5, min(50, int(n_images * 0.02)))

        # --- Select medoids ---
        unique_labels = set(labels)
        unique_labels.discard(-1)  # Remove noise

        if not unique_labels:
            # No clusters found — report to user
            self.progress.emit("No diverse clusters found")
            self.finished_analysis.emit([])
            return

        # Count images per cluster
        cluster_counts = {}
        cluster_members = {}
        for emb_idx, label in enumerate(labels):
            if label == -1:
                continue
            cluster_counts[label] = cluster_counts.get(label, 0) + 1
            if label not in cluster_members:
                cluster_members[label] = []
            cluster_members[label].append(emb_idx)

        # Allocate budget proportionally (every cluster gets at least 1)
        total_clustered = sum(cluster_counts.values())
        allocation = {}
        for label in cluster_counts:
            allocation[label] = max(
                1, int(budget * cluster_counts[label] / total_clustered)
            )

        # If total allocation exceeds budget, trim from largest clusters
        while sum(allocation.values()) > budget:
            largest = max(allocation, key=lambda k: allocation[k])
            if allocation[largest] > 1:
                allocation[largest] -= 1
            else:
                break

        # If total allocation is under budget, add to largest clusters
        while sum(allocation.values()) < budget:
            largest = max(
                allocation,
                key=lambda k: (
                    cluster_counts[k] - allocation[k],
                    cluster_counts[k],
                ),
            )
            if allocation[largest] < cluster_counts[largest]:
                allocation[largest] += 1
            else:
                break

        if self._should_stop:
            return

        # Select medoids: images closest to cluster centroid
        selected_emb_indices = []
        for label, count in allocation.items():
            members = cluster_members[label]
            member_embeddings = all_embeddings[members]

            centroid = member_embeddings.mean(axis=0)
            distances = np.linalg.norm(member_embeddings - centroid, axis=1)

            # Pick top-K closest to centroid
            top_k = min(count, len(members))
            closest_local = np.argsort(distances)[:top_k]
            for local_idx in closest_local:
                selected_emb_indices.append(members[local_idx])

        # Map embedding indices back to original frame indices
        suggested_frames = sorted(
            valid_indices[emb_idx] for emb_idx in selected_emb_indices
        )

        # Remove duplicates (shouldn't happen but be safe)
        suggested_frames = sorted(set(suggested_frames))

        n_clusters = len(unique_labels)
        logger.info(
            f"ReferenceFinderWorker: {n_clusters} clusters, "
            f"selected {len(suggested_frames)} reference frames"
        )

        expected = int(n_images * 0.02)
        if len(suggested_frames) < expected:
            self.progress.emit(
                f"Only {len(suggested_frames)} references identified "
                f"(expected ~{expected})"
            )
        else:
            self.progress.emit(
                f"Found {len(suggested_frames)} reference frames "
                f"across {n_clusters} clusters"
            )

        self.finished_analysis.emit(suggested_frames)
