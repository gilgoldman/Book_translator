"""
Utility functions for Book Translator.
Handles ZIP creation, image loading, and other helpers.
"""

import io
import zipfile
from pathlib import Path
from typing import BinaryIO

from PIL import Image


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
