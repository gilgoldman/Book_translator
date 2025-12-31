"""
Utility functions for Book Translator.
Handles ZIP creation, image loading, and other helpers.
"""

import io
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO

from PIL import Image


# =============================================================================
# Progress Tracking for Mobile-Friendly Upload
# =============================================================================

@dataclass
class BatchInfo:
    """Information about a single batch."""
    batch_num: int
    start_idx: int
    end_idx: int
    status: str = "pending"  # pending, processing, completed, failed
    pages_completed: int = 0

    @property
    def size(self) -> int:
        return self.end_idx - self.start_idx

    @property
    def progress(self) -> float:
        return self.pages_completed / self.size if self.size > 0 else 0


@dataclass
class UploadProgress:
    """
    Tracks upload and processing progress for mobile-friendly display.
    Supports batched processing for large uploads (200+ pages).
    """
    total_pages: int = 0
    current_page: int = 0
    current_batch: int = 0
    total_batches: int = 0
    batch_size: int = 20
    phase: str = "idle"  # idle, uploading, processing, verifying, complete, paused
    batches: list = field(default_factory=list)
    start_time: float = 0
    pages_processed_times: list = field(default_factory=list)  # For ETA calculation
    is_paused: bool = False
    error_message: str = ""

    @property
    def overall_progress(self) -> float:
        """Calculate overall progress as percentage (0-100)."""
        if self.total_pages == 0:
            return 0
        return (self.current_page / self.total_pages) * 100

    @property
    def batch_progress(self) -> float:
        """Calculate current batch progress as percentage (0-100)."""
        if not self.batches or self.current_batch >= len(self.batches):
            return 0
        batch = self.batches[self.current_batch]
        return batch.progress * 100

    def get_eta_seconds(self) -> int | None:
        """Estimate remaining time in seconds based on rolling average."""
        if len(self.pages_processed_times) < 2:
            return None

        # Use last 10 page times for rolling average
        recent_times = self.pages_processed_times[-10:]
        avg_time_per_page = sum(recent_times) / len(recent_times)

        remaining_pages = self.total_pages - self.current_page
        return int(remaining_pages * avg_time_per_page)

    def format_eta(self) -> str:
        """Format ETA as human-readable string."""
        eta = self.get_eta_seconds()
        if eta is None:
            return "Calculating..."

        if eta < 60:
            return f"{eta}s"
        elif eta < 3600:
            mins = eta // 60
            secs = eta % 60
            return f"{mins}m {secs}s"
        else:
            hours = eta // 3600
            mins = (eta % 3600) // 60
            return f"{hours}h {mins}m"


def create_batches(total_pages: int, batch_size: int = 20) -> list[BatchInfo]:
    """
    Split pages into batches for processing.

    Args:
        total_pages: Total number of pages to process
        batch_size: Number of pages per batch (default 20)

    Returns:
        List of BatchInfo objects
    """
    batches = []
    num_batches = (total_pages + batch_size - 1) // batch_size

    for i in range(num_batches):
        start_idx = i * batch_size
        end_idx = min((i + 1) * batch_size, total_pages)
        batches.append(BatchInfo(
            batch_num=i + 1,
            start_idx=start_idx,
            end_idx=end_idx,
        ))

    return batches


def init_upload_progress(total_pages: int, batch_size: int = 20) -> UploadProgress:
    """
    Initialize upload progress tracking for a new upload.

    Args:
        total_pages: Total number of pages to upload
        batch_size: Pages per batch (default 20)

    Returns:
        Initialized UploadProgress object
    """
    import time

    batches = create_batches(total_pages, batch_size)

    return UploadProgress(
        total_pages=total_pages,
        current_page=0,
        current_batch=0,
        total_batches=len(batches),
        batch_size=batch_size,
        phase="processing",
        batches=batches,
        start_time=time.time(),
        pages_processed_times=[],
        is_paused=False,
    )


def get_phase_icon(phase: str) -> str:
    """Get icon for current processing phase."""
    icons = {
        "idle": "⏸️",
        "uploading": "📤",
        "processing": "⚙️",
        "verifying": "🔍",
        "complete": "✅",
        "paused": "⏸️",
        "failed": "❌",
    }
    return icons.get(phase, "⏳")


def get_phase_label(phase: str) -> str:
    """Get human-readable label for current processing phase."""
    labels = {
        "idle": "Ready",
        "uploading": "Uploading",
        "processing": "Translating",
        "verifying": "Verifying",
        "complete": "Complete",
        "paused": "Paused",
        "failed": "Failed",
    }
    return labels.get(phase, "Processing")


def load_image_from_upload(uploaded_file: BinaryIO) -> Image.Image:
    """
    Convert Streamlit uploaded file to PIL Image.
    Handles various image formats and ensures RGB mode.
    """
    image = Image.open(uploaded_file)

    # Convert to RGB if necessary (handles RGBA, P mode, etc.)
    if image.mode in ("RGBA", "P"):
        # Create white background for transparency
        background = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode == "P":
            image = image.convert("RGBA")
        background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
        image = background
    elif image.mode != "RGB":
        image = image.convert("RGB")

    return image


def extract_images_from_zip(zip_file: BinaryIO) -> list[tuple[str, Image.Image]]:
    """
    Extract all valid images from a ZIP file.

    Args:
        zip_file: A file-like object containing the ZIP data

    Returns:
        List of (filename, PIL Image) tuples, sorted naturally by filename
    """
    images = []
    valid_extensions = {".png", ".jpg", ".jpeg", ".webp"}

    with zipfile.ZipFile(zip_file, "r") as zf:
        for name in zf.namelist():
            # Skip directories and hidden files
            if name.endswith("/") or name.startswith("__MACOSX") or "/." in name:
                continue

            # Check file extension
            ext = Path(name).suffix.lower()
            if ext not in valid_extensions:
                continue

            try:
                # Extract and load image
                with zf.open(name) as img_file:
                    img_data = io.BytesIO(img_file.read())
                    image = Image.open(img_data)

                    # Convert to RGB if necessary
                    if image.mode in ("RGBA", "P"):
                        background = Image.new("RGB", image.size, (255, 255, 255))
                        if image.mode == "P":
                            image = image.convert("RGBA")
                        background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
                        image = background
                    elif image.mode != "RGB":
                        image = image.convert("RGB")

                    # Use just the filename, not the full path in zip
                    clean_name = Path(name).name
                    images.append((clean_name, image))
            except Exception:
                # Skip files that can't be opened as images
                continue

    # Sort images naturally by filename
    images.sort(key=lambda x: sort_files_naturally([x[0]])[0])

    return images


def create_zip_in_memory(images: list[tuple[str, Image.Image]]) -> bytes:
    """
    Create ZIP file in memory from list of (filename, PIL Image) tuples.
    Returns the ZIP file as bytes.
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename, img in images:
            # Ensure filename has proper extension
            output_name = get_output_filename(filename)

            # Save image to bytes
            img_buffer = io.BytesIO()
            img.save(img_buffer, format="PNG", optimize=True)
            img_buffer.seek(0)

            # Add to ZIP
            zf.writestr(output_name, img_buffer.getvalue())

    return zip_buffer.getvalue()


def get_output_filename(original_filename: str) -> str:
    """
    Generate output filename from original.
    Example: 'page_001.jpg' -> 'translated_page_001.png'
    """
    stem = Path(original_filename).stem
    return f"translated_{stem}.png"


def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def sort_files_naturally(filenames: list[str]) -> list[str]:
    """
    Sort filenames naturally (page_2 before page_10).
    """
    import re

    def natural_key(filename: str) -> list:
        """Split filename into text and number parts for natural sorting."""
        return [
            int(text) if text.isdigit() else text.lower()
            for text in re.split(r"(\d+)", filename)
        ]

    return sorted(filenames, key=natural_key)


def estimate_processing_time(num_pages: int) -> str:
    """
    Estimate processing time based on number of pages.
    Rough estimate: ~10-15 seconds per page for extraction + editing.
    """
    seconds = num_pages * 12  # Average estimate

    if seconds < 60:
        return f"~{seconds} seconds"
    elif seconds < 3600:
        minutes = seconds // 60
        return f"~{minutes} minute{'s' if minutes > 1 else ''}"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"~{hours}h {minutes}m"


def validate_uploaded_files(files: list) -> tuple[bool, str]:
    """
    Validate uploaded files.
    Returns (is_valid, error_message).
    """
    if not files:
        return False, "No files uploaded"

    if len(files) > 500:
        return False, "Maximum 500 pages allowed per upload"

    valid_extensions = {".png", ".jpg", ".jpeg", ".webp"}

    for f in files:
        ext = Path(f.name).suffix.lower()
        if ext not in valid_extensions:
            return False, f"Invalid file type: {f.name}. Allowed: PNG, JPG, WEBP"

    return True, ""


def create_preview_grid(images: list[Image.Image], max_cols: int = 4, thumb_size: int = 150) -> Image.Image:
    """
    Create a preview grid of thumbnail images.
    Useful for showing upload preview.
    """
    if not images:
        return None

    num_images = min(len(images), 12)  # Max 12 thumbnails
    num_cols = min(num_images, max_cols)
    num_rows = (num_images + num_cols - 1) // num_cols

    # Create grid
    grid_width = num_cols * thumb_size
    grid_height = num_rows * thumb_size
    grid = Image.new("RGB", (grid_width, grid_height), (255, 255, 255))

    for i, img in enumerate(images[:num_images]):
        # Create thumbnail
        thumb = img.copy()
        thumb.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)

        # Calculate position
        row = i // num_cols
        col = i % num_cols
        x = col * thumb_size + (thumb_size - thumb.width) // 2
        y = row * thumb_size + (thumb_size - thumb.height) // 2

        grid.paste(thumb, (x, y))

    return grid
