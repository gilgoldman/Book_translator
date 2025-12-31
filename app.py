"""
Book Translator - Streamlit App
Translates illustrated books from English to Hebrew.
"""

import streamlit as st

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
)


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
        "current_index": 0,
        "results": [],  # List of (filename, translated_image) tuples
        "uploaded_images": [],  # List of (filename, PIL Image) tuples
        "accumulated_images": [],  # For chunked upload mode
        "batch_job_id": None,
        "upload_mode": "single",  # "single" or "chunked"
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


init_session_state()


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
        for key in list(st.session_state.keys()):
            del st.session_state[key]
        st.rerun()


# Main content area
st.header("1️⃣ Upload Book Pages")

# Upload mode selection
upload_mode = st.radio(
    "Upload mode:",
    ["📄 Single upload", "📚 Chunked upload (for large books)"],
    horizontal=True,
    help="Use chunked upload if you have many pages (100+) and uploads keep stalling. Upload in batches of 30-50 pages.",
)

is_chunked = "Chunked" in upload_mode

if is_chunked:
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

        # Sort files naturally
        sorted_files = sorted(uploaded_files, key=lambda f: sort_files_naturally([f.name])[0])

        # Show upload summary
        st.success(f"✅ {len(sorted_files)} pages uploaded")

        # Estimate time
        if "Real-time" in mode:
            est_time = estimate_processing_time(len(sorted_files))
            st.info(f"⏱️ Estimated processing time: {est_time}")

        if len(sorted_files) > 50 and "Real-time" in mode:
            st.warning(
                "💡 **Tip:** For 50+ pages, consider using Batch mode for ~50% cost savings."
            )

        if len(sorted_files) > 100:
            st.warning(
                "⚠️ **Large upload detected.** If uploads stall, try **Chunked upload mode** above."
            )

        # Preview first few pages
        with st.expander("👁️ Preview uploaded pages", expanded=False):
            cols = st.columns(min(4, len(sorted_files)))
            for i, f in enumerate(sorted_files[:4]):
                with cols[i]:
                    st.image(f, caption=f.name, width=150)
            if len(sorted_files) > 4:
                st.caption(f"... and {len(sorted_files) - 4} more pages")
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


# Processing section
st.header("2️⃣ Translate")

if "Real-time" in mode:
    # Real-time processing
    has_files = bool(uploaded_files) if not is_chunked else bool(st.session_state.accumulated_images)
    start_disabled = not has_files or st.session_state.processing

    if st.button("🚀 Start Translation", disabled=start_disabled, type="primary") or st.session_state.processing:
        if not st.session_state.processing:
            # Starting fresh
            st.session_state.processing = True
            st.session_state.results = []
            st.session_state.current_index = 0

            # Load all images into session state
            st.session_state.uploaded_images = []

            if is_chunked:
                # Chunked mode: images already loaded in accumulated_images
                st.session_state.uploaded_images = st.session_state.accumulated_images.copy()
            else:
                # Single mode: load from uploaded files
                sorted_files = sorted(uploaded_files, key=lambda f: sort_files_naturally([f.name])[0])
                for f in sorted_files:
                    img = load_image_from_upload(f)
                    st.session_state.uploaded_images.append((f.name, img))

        # Processing UI
        images = st.session_state.uploaded_images
        total = len(images)
        start_from = st.session_state.current_index

        progress_bar = st.progress(start_from / total if total > 0 else 0)
        status_container = st.empty()
        preview_container = st.empty()

        for i in range(start_from, total):
            filename, image = images[i]

            # Checkpoint at 300 pages
            if i > 0 and i % 300 == 0 and i > start_from:
                st.session_state.paused_at_checkpoint = True
                st.session_state.current_index = i
                st.rerun()

            # Update status
            status_container.text(f"Processing page {i + 1}/{total}: {filename}")

            # Show current page being processed
            with preview_container.container():
                col1, col2 = st.columns(2)
                with col1:
                    st.image(image, caption=f"Original: {filename}", width=300)
                with col2:
                    st.info("⏳ Translating...")

            try:
                # Process the page
                result = process_single_page(image, filename, verify=verify)

                if result["status"] == "failed":
                    log_error(filename, result.get("error", "Unknown error"))
                    status_icon = "❌"
                elif result["status"] == "duplicate":
                    status_icon = "⏭️"
                elif result["status"] == "needs_review":
                    status_icon = "⚠️"
                else:
                    status_icon = "✅"

                # Store result
                if result["translated_image"] is not None:
                    st.session_state.results.append((filename, result["translated_image"]))

                # Update preview with result
                with preview_container.container():
                    col1, col2 = st.columns(2)
                    with col1:
                        st.image(image, caption=f"Original: {filename}", width=300)
                    with col2:
                        if result["translated_image"] is not None:
                            st.image(
                                result["translated_image"],
                                caption=f"{status_icon} Translated",
                                width=300,
                            )
                        else:
                            st.warning("No output image")

            except Exception as e:
                log_error(filename, str(e))
                status_container.error(f"❌ Error processing {filename}: {e}")

            # Update progress
            progress_bar.progress((i + 1) / total)
            st.session_state.current_index = i + 1

        # Done!
        st.session_state.processing = False
        st.session_state.current_index = 0
        preview_container.empty()
        status_container.success(f"✅ Completed! {len(st.session_state.results)} pages translated.")

else:
    # Batch mode
    st.subheader("Batch Processing")

    col1, col2 = st.columns(2)

    has_files = bool(uploaded_files) if not is_chunked else bool(st.session_state.accumulated_images)

    with col1:
        if st.button("📤 Submit Batch Job", disabled=not has_files):
            with st.spinner("Submitting batch job..."):
                # Load images
                if is_chunked:
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

if st.session_state.results:
    num_results = len(st.session_state.results)
    st.success(f"📄 {num_results} translated pages ready")

    # Preview
    with st.expander("👁️ Preview translated pages", expanded=True):
        cols = st.columns(min(4, num_results))
        for i, (filename, img) in enumerate(st.session_state.results[:4]):
            with cols[i]:
                st.image(img, caption=get_output_filename(filename), width=150)
        if num_results > 4:
            st.caption(f"... and {num_results - 4} more pages")

    # Download button
    with st.spinner("Creating ZIP file..."):
        zip_bytes = create_zip_in_memory(st.session_state.results)

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

else:
    st.info("👆 Upload pages and start translation to see results here.")


# Footer
st.divider()
st.caption(
    "Book Translator v1.0 | "
    "Powered by Google Gemini | "
    "[Report Issues](https://github.com/your-repo/issues)"
)
