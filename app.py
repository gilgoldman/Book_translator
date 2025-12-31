"""
Book Translator - Streamlit App
Translates illustrated books from English to Hebrew.
"""

import logging
import time
import traceback
import streamlit as st

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from database import get_stats, get_verification_issues, get_failed_pages, log_error
from translator import process_single_page
from batch import submit_batch_job, check_batch_status, process_batch_results
from utils import (
    load_image_from_upload,
    create_zip_in_memory,
    get_output_filename,
    sort_files_naturally,
    estimate_processing_time,
    validate_uploaded_files,
    init_upload_progress,
    get_phase_icon,
    get_phase_label,
    UploadProgress,
    extract_images_from_zip,
    stream_images_from_zip,
    count_images_in_zip,
    TempResultStorage,
)


# =============================================================================
# Mobile-Friendly Progress Component CSS
# =============================================================================

PROGRESS_CSS = """
<style>
/* Progress Container - works on all screen sizes */
.progress-container {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    padding: 24px;
    color: white;
    margin: 16px 0;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}

/* Circular Progress Ring */
.progress-ring-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 16px;
}

.progress-ring {
    position: relative;
    width: 140px;
    height: 140px;
}

.progress-ring svg {
    transform: rotate(-90deg);
    width: 140px;
    height: 140px;
}

.progress-ring circle {
    fill: none;
    stroke-width: 10;
}

.progress-ring .bg {
    stroke: rgba(255,255,255,0.2);
}

.progress-ring .progress {
    stroke: white;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s ease;
}

.progress-ring .center-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
}

.progress-ring .percentage {
    font-size: 28px;
    font-weight: bold;
    display: block;
}

.progress-ring .page-count {
    font-size: 14px;
    opacity: 0.9;
}

/* Batch Progress Bar */
.batch-progress {
    margin: 16px 0;
    padding: 12px;
    background: rgba(255,255,255,0.1);
    border-radius: 8px;
}

.batch-label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 14px;
}

.batch-bar {
    height: 8px;
    background: rgba(255,255,255,0.2);
    border-radius: 4px;
    overflow: hidden;
}

.batch-bar-fill {
    height: 100%;
    background: white;
    border-radius: 4px;
    transition: width 0.3s ease;
}

/* Status Info */
.status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.status-row:last-child {
    border-bottom: none;
}

.status-label {
    font-size: 14px;
    opacity: 0.9;
}

.status-value {
    font-size: 14px;
    font-weight: 600;
}

/* Current Page Thumbnail */
.current-page-preview {
    margin-top: 16px;
    text-align: center;
}

.current-page-preview img {
    max-width: 120px;
    border-radius: 8px;
    border: 2px solid rgba(255,255,255,0.3);
}

/* Compact Progress (for sidebar or small displays) */
.compact-progress {
    background: #f0f2f6;
    border-radius: 12px;
    padding: 16px;
    margin: 8px 0;
}

.compact-progress .mini-ring {
    width: 60px;
    height: 60px;
    margin: 0 auto 8px;
}

.compact-progress .info {
    text-align: center;
    font-size: 13px;
    color: #555;
}

/* Batch chips */
.batch-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
}

.batch-chip {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
}

.batch-chip.pending { background: rgba(255,255,255,0.2); }
.batch-chip.processing { background: #ffd700; color: #333; }
.batch-chip.completed { background: #4ade80; color: #166534; }
.batch-chip.failed { background: #f87171; color: #7f1d1d; }

/* Animation for processing state */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

.processing-indicator {
    animation: pulse 1.5s ease-in-out infinite;
}
</style>
"""


def render_progress_component(progress: UploadProgress, current_filename: str = "") -> str:
    """
    Render the mobile-friendly progress component as HTML.

    Args:
        progress: UploadProgress object with current state
        current_filename: Name of the file currently being processed

    Returns:
        HTML string for the progress component
    """
    # Calculate SVG circle parameters
    radius = 60
    circumference = 2 * 3.14159 * radius
    progress_offset = circumference - (progress.overall_progress / 100) * circumference

    # Calculate batch bar width
    batch_pct = progress.batch_progress

    # Build batch chips HTML
    batch_chips = ""
    if progress.total_batches > 1:
        # Show max 10 batch chips to avoid clutter
        display_batches = progress.batches[:10] if len(progress.batches) > 10 else progress.batches
        for b in display_batches:
            batch_chips += f'<span class="batch-chip {b.status}">{b.batch_num}</span>'
        if len(progress.batches) > 10:
            remaining = len(progress.batches) - 10
            batch_chips += f'<span class="batch-chip pending">+{remaining}</span>'

    phase_icon = get_phase_icon(progress.phase)
    phase_label = get_phase_label(progress.phase)

    html = f"""
    <div class="progress-container">
        <!-- Circular Progress Ring -->
        <div class="progress-ring-container">
            <div class="progress-ring">
                <svg viewBox="0 0 140 140">
                    <circle class="bg" cx="70" cy="70" r="{radius}"/>
                    <circle class="progress" cx="70" cy="70" r="{radius}"
                        stroke-dasharray="{circumference}"
                        stroke-dashoffset="{progress_offset}"/>
                </svg>
                <div class="center-text">
                    <span class="percentage">{int(progress.overall_progress)}%</span>
                    <span class="page-count">{progress.current_page}/{progress.total_pages}</span>
                </div>
            </div>
        </div>

        <!-- Batch Progress (if multiple batches) -->
        {"" if progress.total_batches <= 1 else f'''
        <div class="batch-progress">
            <div class="batch-label">
                <span>Batch {progress.current_batch + 1} of {progress.total_batches}</span>
                <span>{int(batch_pct)}%</span>
            </div>
            <div class="batch-bar">
                <div class="batch-bar-fill" style="width: {batch_pct}%"></div>
            </div>
            <div class="batch-chips">{batch_chips}</div>
        </div>
        '''}

        <!-- Status Info -->
        <div class="status-info">
            <div class="status-row">
                <span class="status-label">Status</span>
                <span class="status-value processing-indicator">{phase_icon} {phase_label}</span>
            </div>
            <div class="status-row">
                <span class="status-label">Time Remaining</span>
                <span class="status-value">{progress.format_eta()}</span>
            </div>
            {"" if not current_filename else f'''
            <div class="status-row">
                <span class="status-label">Current Page</span>
                <span class="status-value">{current_filename[:25]}{"..." if len(current_filename) > 25 else ""}</span>
            </div>
            '''}
        </div>
    </div>
    """
    return html


def render_compact_progress(progress: UploadProgress) -> str:
    """
    Render a compact progress indicator for sidebar or small spaces.

    Args:
        progress: UploadProgress object

    Returns:
        HTML string for compact progress
    """
    radius = 25
    circumference = 2 * 3.14159 * radius
    progress_offset = circumference - (progress.overall_progress / 100) * circumference

    html = f"""
    <div class="compact-progress">
        <div class="mini-ring">
            <svg viewBox="0 0 60 60" style="width:60px;height:60px;transform:rotate(-90deg)">
                <circle fill="none" stroke="#e0e0e0" stroke-width="6" cx="30" cy="30" r="{radius}"/>
                <circle fill="none" stroke="#667eea" stroke-width="6" cx="30" cy="30" r="{radius}"
                    stroke-linecap="round"
                    stroke-dasharray="{circumference}"
                    stroke-dashoffset="{progress_offset}"/>
            </svg>
        </div>
        <div class="info">
            <strong>{int(progress.overall_progress)}%</strong> ({progress.current_page}/{progress.total_pages})
            <br/>
            {get_phase_icon(progress.phase)} {get_phase_label(progress.phase)}
        </div>
    </div>
    """
    return html


# Page configuration
st.set_page_config(
    page_title="Book Translator",
    page_icon="📚",
    layout="wide",
)

st.title("📚 Book Translator: English → Hebrew")
st.caption("Upload illustrated book pages and get them translated to Hebrew")


# Initialize session state
def init_session_state():
    defaults = {
        "processing": False,
        "paused_at_checkpoint": False,
        "paused_at_batch": False,  # Pause between batches
        "current_index": 0,
        "results": [],  # List of (filename, translated_image) tuples - DEPRECATED, use temp_storage
        "uploaded_images": [],  # List of (filename, PIL Image) tuples - only for preview now
        "accumulated_images": [],  # For chunked upload mode
        "batch_job_id": None,
        "upload_mode": "single",  # "single" or "chunked"
        "upload_progress": None,  # UploadProgress object for tracking
        "last_page_time": None,  # For ETA calculation
        "temp_storage": None,  # TempResultStorage for memory-efficient result storage
        "zip_file_ref": None,  # Reference to uploaded ZIP file for streaming
        "total_pages": 0,  # Total pages count for streaming mode
        "file_refs": None,  # File references for single-upload streaming mode
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


init_session_state()

# Inject CSS for progress component
st.markdown(PROGRESS_CSS, unsafe_allow_html=True)


# Sidebar for settings
with st.sidebar:
    st.header("⚙️ Settings")

    mode = st.radio(
        "Processing mode:",
        ["⚡ Real-time", "💰 Batch (overnight, ~50% cheaper)"],
        help="Batch mode submits jobs to run overnight at reduced cost. Recommended for 50+ pages.",
    )

    verify = st.checkbox(
        "🔍 Enable verification",
        value=False,
        help="Runs an extra check on each translation (+33% API cost). Recommended for important books.",
    )

    st.divider()

    # Stats
    if st.button("📊 Show Stats"):
        stats = get_stats()
        st.json(stats)

    if st.button("🔄 Reset Session"):
        # Clean up temp storage before resetting
        if st.session_state.get("temp_storage"):
            st.session_state.temp_storage.cleanup()
        for key in list(st.session_state.keys()):
            del st.session_state[key]
        st.rerun()


# Main content area
st.header("1️⃣ Upload Book Pages")

# Upload mode selection
upload_mode = st.radio(
    "Upload mode:",
    ["📄 Single upload", "📦 ZIP upload", "📚 Chunked upload (for large books)"],
    horizontal=True,
    help="ZIP upload extracts images from a ZIP file. Chunked mode is for large books (100+ pages) that stall during upload.",
)

is_chunked = "Chunked" in upload_mode
is_zip = "ZIP" in upload_mode

if is_zip:
    st.info(
        "**ZIP mode:** Upload a ZIP file containing your book pages. "
        "All PNG, JPG, and WEBP images will be extracted automatically."
    )

    # ZIP file uploader
    zip_file = st.file_uploader(
        "Upload ZIP file containing book pages:",
        type=["zip"],
        accept_multiple_files=False,
        help="Upload a ZIP file with your book pages. Images will be extracted and sorted naturally.",
        key="zip_uploader",
    )

    if zip_file:
        logger.info(f"ZIP file uploaded: {zip_file.name}, size: {zip_file.size} bytes")
        st.write(f"📁 Processing: `{zip_file.name}` ({zip_file.size / 1024 / 1024:.1f} MB)")

        extraction_status = st.empty()
        extraction_status.info("🔄 Scanning ZIP file for images...")

        try:
            # MEMORY-EFFICIENT: Count images without loading them
            logger.info("Counting images in ZIP (without loading)...")
            image_count, image_filenames = count_images_in_zip(zip_file)
            logger.info(f"ZIP scan found {image_count} valid images")

            if image_count == 0:
                logger.warning("No valid images found in ZIP file")
                extraction_status.error("No valid images found in ZIP file. Supported formats: PNG, JPG, WEBP")
                uploaded_files = None
                sorted_files = []
            else:
                extraction_status.success(f"✅ Found {image_count} images in ZIP (will process one at a time)")
                logger.info(f"Ready to stream {image_count} images")

                # Store ZIP reference for streaming during processing
                st.session_state.zip_file_ref = zip_file
                st.session_state.total_pages = image_count
                logger.debug(f"Stored ZIP reference for streaming")

                # Estimate time
                if "Real-time" in mode:
                    est_time = estimate_processing_time(image_count)
                    st.info(f"⏱️ Estimated processing time: {est_time}")

                # Memory efficiency notice
                st.info("💡 **Memory-efficient mode:** Images will be processed one at a time to prevent crashes.")

                # Set variables for processing
                uploaded_files = True  # Flag indicating we have files
                sorted_files = image_filenames  # Just filenames for count
                logger.info("ZIP upload handling complete, ready for streaming processing")

        except Exception as e:
            error_msg = f"Error scanning ZIP file: {e}"
            logger.error(error_msg, exc_info=True)
            extraction_status.error(error_msg)
            st.code(traceback.format_exc(), language="python")
            uploaded_files = None
            sorted_files = []
    else:
        logger.debug("No ZIP file uploaded yet")
        uploaded_files = None
        sorted_files = []

elif is_chunked:
    st.info(
        "**Chunked mode:** Upload pages in batches (30-50 at a time). "
        "Pages accumulate until you start processing."
    )

    # Show accumulated pages count
    if st.session_state.accumulated_images:
        accumulated_count = len(st.session_state.accumulated_images)
        st.success(f"📚 **{accumulated_count} pages accumulated** (ready to process)")

        # Preview accumulated pages
        with st.expander("👁️ Preview accumulated pages", expanded=False):
            preview_count = min(8, accumulated_count)
            cols = st.columns(min(4, preview_count))
            for i in range(preview_count):
                filename, img = st.session_state.accumulated_images[i]
                with cols[i % 4]:
                    st.image(img, caption=filename, width=120)
            if accumulated_count > 8:
                st.caption(f"... and {accumulated_count - 8} more pages")

        # Clear button
        if st.button("🗑️ Clear all accumulated pages"):
            st.session_state.accumulated_images = []
            st.rerun()

    # Chunked file uploader
    uploaded_files = st.file_uploader(
        "Add more pages (30-50 at a time recommended):",
        type=["png", "jpg", "jpeg", "webp"],
        accept_multiple_files=True,
        help="Upload a batch of pages. They will be added to your accumulated pages.",
        key="chunked_uploader",
    )

    if uploaded_files:
        # Validate files
        is_valid, error_msg = validate_uploaded_files(uploaded_files)
        if not is_valid:
            st.error(error_msg)
        else:
            # Add to accumulated images
            if st.button(f"➕ Add {len(uploaded_files)} pages to queue", type="primary"):
                with st.spinner(f"Loading {len(uploaded_files)} images..."):
                    for f in uploaded_files:
                        img = load_image_from_upload(f)
                        st.session_state.accumulated_images.append((f.name, img))

                # Sort accumulated images naturally
                st.session_state.accumulated_images.sort(
                    key=lambda x: sort_files_naturally([x[0]])[0]
                )
                st.success(f"✅ Added {len(uploaded_files)} pages!")
                st.rerun()

    # For processing, use accumulated images
    if st.session_state.accumulated_images:
        # Create a virtual "uploaded_files" list for compatibility
        uploaded_files = st.session_state.accumulated_images
        sorted_files = uploaded_files  # Already sorted
    else:
        uploaded_files = None
        sorted_files = []

else:
    # Standard single upload mode
    uploaded_files = st.file_uploader(
        "Upload book pages (PNG, JPG, WEBP):",
        type=["png", "jpg", "jpeg", "webp"],
        accept_multiple_files=True,
        help="Upload all pages of your book. They will be processed in alphabetical order.",
        key="single_uploader",
    )

    if uploaded_files:
        # Validate files
        is_valid, error_msg = validate_uploaded_files(uploaded_files)
        if not is_valid:
            st.error(error_msg)
            st.stop()

        # Sort files naturally (just references, not loading into memory)
        sorted_files = sorted(uploaded_files, key=lambda f: sort_files_naturally([f.name])[0])

        # MEMORY-EFFICIENT: Store file references, not loaded images
        st.session_state.file_refs = sorted_files
        st.session_state.total_pages = len(sorted_files)
        logger.info(f"Stored {len(sorted_files)} file references for streaming processing")

        # Show upload summary
        st.success(f"✅ {len(sorted_files)} pages uploaded (will process one at a time)")

        # Estimate time
        if "Real-time" in mode:
            est_time = estimate_processing_time(len(sorted_files))
            st.info(f"⏱️ Estimated processing time: {est_time}")

        if len(sorted_files) > 50 and "Real-time" in mode:
            st.warning(
                "💡 **Tip:** For 50+ pages, consider using Batch mode for ~50% cost savings."
            )

        if len(sorted_files) > 100:
            st.info(
                "💡 **Memory-efficient mode:** Images will be processed one at a time to prevent crashes."
            )
    else:
        sorted_files = []


# Handle checkpoint pause
if st.session_state.paused_at_checkpoint:
    st.warning("⚠️ **Checkpoint reached!** 300 pages processed. Please review the output before continuing.")

    col1, col2 = st.columns(2)
    with col1:
        if st.button("✅ Continue Processing", type="primary"):
            st.session_state.paused_at_checkpoint = False
            st.rerun()
    with col2:
        if st.button("🛑 Stop Here"):
            st.session_state.processing = False
            st.session_state.paused_at_checkpoint = False
            st.success("Processing stopped. Partial results are available below.")

    st.stop()

# Handle batch pause (pause between batches for large uploads)
if st.session_state.paused_at_batch:
    progress = st.session_state.upload_progress
    if progress:
        completed_batches = progress.current_batch
        total_batches = progress.total_batches

        st.info(f"⏸️ **Batch {completed_batches} of {total_batches} complete.** Ready to continue with the next batch.")

        # Show current progress
        st.markdown(render_progress_component(progress, "Paused"), unsafe_allow_html=True)

        col1, col2 = st.columns(2)
        with col1:
            if st.button("▶️ Continue to Next Batch", type="primary"):
                st.session_state.paused_at_batch = False
                st.session_state.upload_progress.is_paused = False
                st.rerun()
        with col2:
            if st.button("🛑 Stop Here"):
                st.session_state.processing = False
                st.session_state.paused_at_batch = False
                st.session_state.upload_progress = None
                st.success(f"Processing stopped after {completed_batches} batches. Partial results are available below.")

        st.stop()


# Processing section
st.header("2️⃣ Translate")

if "Real-time" in mode:
    # Real-time processing with batching and mobile-friendly progress
    if is_zip:
        has_files = bool(uploaded_files)  # ZIP: uploaded_files is list of (name, image) tuples
    elif is_chunked:
        has_files = bool(st.session_state.accumulated_images)
    else:
        has_files = bool(uploaded_files)
    start_disabled = not has_files or st.session_state.processing

    # Batch size configuration for large uploads
    BATCH_SIZE = 20  # Process 20 pages per batch
    PAUSE_EVERY_N_BATCHES = 5  # Pause every 5 batches (100 pages) for user review

    if st.button("🚀 Start Translation", disabled=start_disabled, type="primary") or st.session_state.processing:
        logger.info(f"Start Translation button clicked or processing={st.session_state.processing}")

        if not st.session_state.processing:
            # Starting fresh - MEMORY EFFICIENT: Don't load all images upfront
            logger.info("Starting fresh processing session (memory-efficient mode)")
            st.session_state.processing = True
            st.session_state.results = []  # Keep for backward compatibility
            st.session_state.current_index = 0

            # Initialize temp storage for results (saves to disk, not memory)
            st.session_state.temp_storage = TempResultStorage()
            logger.info("Initialized TempResultStorage for disk-based result storage")

            # Get total pages count (already stored during upload)
            total_pages = st.session_state.total_pages
            logger.info(f"Initializing progress tracking for {total_pages} pages")
            st.session_state.upload_progress = init_upload_progress(total_pages, BATCH_SIZE)
            st.session_state.last_page_time = time.time()

        # Processing UI with batched progress
        total = st.session_state.total_pages
        start_from = st.session_state.current_index
        progress = st.session_state.upload_progress
        temp_storage = st.session_state.temp_storage

        logger.info(f"Processing UI: total={total}, start_from={start_from}, progress={progress is not None}")

        # Create containers for dynamic updates
        progress_header = st.empty()
        progress_bar = st.progress(start_from / total if total > 0 else 0)
        progress_text = st.empty()
        status_text = st.empty()

        # Determine current batch
        current_batch_idx = start_from // BATCH_SIZE

        # MEMORY-EFFICIENT: Create image iterator based on upload mode
        def get_image_iterator():
            """Generator that yields (filename, image) one at a time."""
            if is_zip:
                # Stream from ZIP file
                zip_file = st.session_state.zip_file_ref
                if zip_file:
                    zip_file.seek(0)
                    yield from stream_images_from_zip(zip_file)
            elif is_chunked:
                # Chunked mode: iterate through accumulated images
                for item in st.session_state.accumulated_images:
                    yield item
            else:
                # Single mode: load one file at a time
                file_refs = st.session_state.file_refs
                if file_refs:
                    for f in file_refs:
                        img = load_image_from_upload(f)
                        yield (f.name, img)

        # Skip already processed images and process remaining
        image_iter = get_image_iterator()
        for skip_idx in range(start_from):
            try:
                next(image_iter)
            except StopIteration:
                break

        # Process remaining images
        for i, (filename, image) in enumerate(image_iter, start=start_from):
            # Update batch tracking
            batch_idx = i // BATCH_SIZE
            page_in_batch = i % BATCH_SIZE

            # Check if we've moved to a new batch
            if batch_idx != current_batch_idx:
                if current_batch_idx < len(progress.batches):
                    progress.batches[current_batch_idx].status = "completed"
                current_batch_idx = batch_idx

                # Pause every N batches for large uploads (100+ pages)
                if total > 50 and batch_idx > 0 and batch_idx % PAUSE_EVERY_N_BATCHES == 0:
                    progress.current_batch = batch_idx
                    progress.phase = "paused"
                    progress.is_paused = True
                    st.session_state.paused_at_batch = True
                    st.session_state.current_index = i
                    # Clear image from memory before pausing
                    del image
                    st.rerun()

            # Update current batch status
            if batch_idx < len(progress.batches):
                progress.batches[batch_idx].status = "processing"
                progress.batches[batch_idx].pages_completed = page_in_batch

            # Update progress state
            progress.current_page = i
            progress.current_batch = batch_idx
            progress.phase = "verifying" if verify else "processing"

            # Calculate time for this page (for ETA)
            current_time = time.time()
            if st.session_state.last_page_time:
                page_duration = current_time - st.session_state.last_page_time
                if page_duration > 0 and page_duration < 120:
                    progress.pages_processed_times.append(page_duration)

            # Update progress displays
            progress_bar.progress((i + 1) / total)
            progress_header.markdown(render_progress_component(progress, filename), unsafe_allow_html=True)

            batch_info = f"Batch {batch_idx + 1}/{progress.total_batches}" if progress.total_batches > 1 else ""
            progress_text.markdown(
                f"**Page {i + 1}/{total}** | {batch_info} | ⏱️ {progress.format_eta()} remaining | 📄 `{filename}`"
            )

            try:
                # Process the page
                result = process_single_page(image, filename, verify=verify)
                st.session_state.last_page_time = time.time()

                if result["status"] == "failed":
                    log_error(filename, result.get("error", "Unknown error"))
                    status_icon = "❌"
                elif result["status"] == "duplicate":
                    status_icon = "⏭️"
                elif result["status"] == "needs_review":
                    status_icon = "⚠️"
                else:
                    status_icon = "✅"

                # MEMORY-EFFICIENT: Save result to disk, not memory
                translated_img = result.get("translated_image")
                if translated_img is not None:
                    temp_storage.save_result(filename, translated_img)
                    logger.debug(f"Saved {filename} to temp storage, total: {temp_storage.get_result_count()}")
                    del translated_img

                del result

            except Exception as e:
                log_error(filename, str(e))
                status_text.error(f"❌ Error processing {filename}: {e}")
                st.session_state.last_page_time = time.time()

            # MEMORY-EFFICIENT: Delete original image to free memory
            del image

            # Update session state
            st.session_state.current_index = i + 1
            progress.current_page = i + 1

            if batch_idx < len(progress.batches):
                progress.batches[batch_idx].pages_completed = page_in_batch + 1

        # Mark final batch as complete
        if current_batch_idx < len(progress.batches):
            progress.batches[current_batch_idx].status = "completed"

        # Done!
        progress.phase = "complete"
        progress.current_page = total

        progress_header.markdown(render_progress_component(progress, ""), unsafe_allow_html=True)
        progress_bar.progress(1.0)
        progress_text.markdown(f"**✅ Complete!** All {total} pages processed.")

        st.session_state.processing = False
        st.session_state.current_index = 0
        st.session_state.upload_progress = None
        status_text.success(f"✅ Completed! {temp_storage.get_result_count()} pages translated.")

else:
    # Batch mode
    st.subheader("Batch Processing")

    col1, col2 = st.columns(2)

    if is_zip:
        has_files = bool(uploaded_files)
    elif is_chunked:
        has_files = bool(st.session_state.accumulated_images)
    else:
        has_files = bool(uploaded_files)

    with col1:
        if st.button("📤 Submit Batch Job", disabled=not has_files):
            with st.spinner("Submitting batch job..."):
                # Load images based on upload mode
                if is_zip:
                    # ZIP mode: images already extracted
                    images = uploaded_files.copy() if uploaded_files else []
                elif is_chunked:
                    images = st.session_state.accumulated_images.copy()
                else:
                    sorted_files = sorted(uploaded_files, key=lambda f: sort_files_naturally([f.name])[0])
                    images = [(f.name, load_image_from_upload(f)) for f in sorted_files]

                # Submit batch
                job_id = submit_batch_job(images)
                st.session_state.batch_job_id = job_id
                st.session_state.uploaded_images = images

            st.success("✅ Batch job submitted!")
            st.code(job_id, language=None)
            st.info(
                "📋 **Copy this Job ID!** You'll need it to check status and retrieve results. "
                "Processing takes up to 24 hours."
            )

    with col2:
        st.text_input(
            "Or enter existing Job ID:",
            key="input_job_id",
            placeholder="projects/xxx/locations/xxx/batchJobs/xxx",
        )

    st.divider()

    # Check status
    job_id_to_check = st.session_state.get("input_job_id") or st.session_state.batch_job_id

    if job_id_to_check:
        if st.button("🔄 Check Batch Status"):
            status = check_batch_status(job_id_to_check)

            if status["error"]:
                st.error(f"Error: {status['error']}")
            else:
                st.write(f"**Status:** {status['status']}")
                st.progress(
                    status["completed"] / status["total"] if status["total"] > 0 else 0
                )
                st.write(
                    f"**Progress:** {status['completed']}/{status['total']} pages "
                    f"({status['failed']} failed)"
                )

                if status["status"] in ["SUCCEEDED", "JOB_STATE_SUCCEEDED"]:
                    st.success("🎉 Batch job completed!")

                    if st.button("📥 Generate Translated Images", type="primary"):
                        if not st.session_state.uploaded_images:
                            st.error(
                                "Original images not found in session. "
                                "Please re-upload the images to generate translations."
                            )
                        else:
                            with st.spinner("Generating translated images..."):
                                progress_bar = st.progress(0)

                                def update_progress(current, total):
                                    progress_bar.progress(current / total)

                                results = process_batch_results(
                                    job_id_to_check,
                                    st.session_state.uploaded_images,
                                    verify=verify,
                                    progress_callback=update_progress,
                                )

                                st.session_state.results = [
                                    (filename, img) for filename, img, _ in results
                                ]

                            st.success(
                                f"✅ Done! {len(st.session_state.results)} pages translated."
                            )


# Results section
st.header("3️⃣ Download Results")

# Check for results in temp_storage (memory-efficient) or legacy results list
temp_storage = st.session_state.get("temp_storage")
has_temp_results = temp_storage is not None and temp_storage.get_result_count() > 0
has_legacy_results = bool(st.session_state.results)

if has_temp_results:
    # MEMORY-EFFICIENT: Results are stored on disk
    num_results = temp_storage.get_result_count()
    st.success(f"📄 {num_results} translated pages ready for download")

    # Download button - streams from disk
    with st.spinner("Creating ZIP file from saved results..."):
        zip_bytes = temp_storage.create_zip()

    st.download_button(
        "📥 Download All (ZIP)",
        data=zip_bytes,
        file_name="translated_book.zip",
        mime="application/zip",
        type="primary",
    )

    # Show any issues
    verification_issues = get_verification_issues()
    if verification_issues:
        with st.expander(f"⚠️ {len(verification_issues)} pages flagged for review"):
            for issue in verification_issues:
                st.write(f"**{issue['filename']}:** {', '.join(issue['issues'])}")

    failed_pages = get_failed_pages()
    if failed_pages:
        with st.expander(f"❌ {len(failed_pages)} pages failed"):
            for page in failed_pages:
                st.write(f"**{page['filename']}:** {page['error']}")

elif has_legacy_results:
    # Legacy mode: results in memory (backward compatibility)
    num_results = len(st.session_state.results)
    st.success(f"📄 {num_results} translated pages ready for download")

    with st.spinner("Creating ZIP file..."):
        zip_bytes = create_zip_in_memory(st.session_state.results)

    st.download_button(
        "📥 Download All (ZIP)",
        data=zip_bytes,
        file_name="translated_book.zip",
        mime="application/zip",
        type="primary",
    )

    verification_issues = get_verification_issues()
    if verification_issues:
        with st.expander(f"⚠️ {len(verification_issues)} pages flagged for review"):
            for issue in verification_issues:
                st.write(f"**{issue['filename']}:** {', '.join(issue['issues'])}")

    failed_pages = get_failed_pages()
    if failed_pages:
        with st.expander(f"❌ {len(failed_pages)} pages failed"):
            for page in failed_pages:
                st.write(f"**{page['filename']}:** {page['error']}")

else:
    st.info("👆 Upload pages and start translation to see results here.")


# Footer
st.divider()
st.caption(
    "Book Translator v1.0 | "
    "Powered by Google Gemini | "
    "[Report Issues](https://github.com/your-repo/issues)"
)
