"""
Batch processing operations for Book Translator.
Handles Gemini Batch API for cheaper overnight processing.
"""

import io
from pathlib import Path
from typing import Optional

import streamlit as st
from google import genai
from google.genai import types
from PIL import Image

from database import save_batch_job, get_batch_job, update_batch_job_status
from translator import parse_json_response, edit_image_with_hebrew, verify_translation


def get_client() -> genai.Client:
    """Get Gemini client with API key from Streamlit secrets."""
    return genai.Client(api_key=st.secrets["GEMINI_API_KEY"])


def submit_batch_job(images: list[tuple[str, Image.Image]]) -> str:
    """
    Submit batch job for extraction + translation.
    Returns job ID for status checking later.

    Args:
        images: List of (filename, PIL Image) tuples
    """
    client = get_client()

    prompt = '''
    1. Extract ALL English text from this image exactly as written.
    2. Translate each text element to Hebrew.

    Return JSON:
    {
        "extracted_text": "full original English text here...",
        "translations": [
            {"english": "...", "hebrew": "..."},
            ...
        ]
    }

    If there is no text in the image, return:
    {"extracted_text": "", "translations": []}
    '''

    requests = []
    for i, (filename, image) in enumerate(images):
        # Convert image to bytes for batch API
        img_buffer = io.BytesIO()
        image.save(img_buffer, format="PNG")
        img_bytes = img_buffer.getvalue()

        custom_id = f"page_{i:04d}_{Path(filename).stem}"

        requests.append(types.BatchJobSource(
            custom_id=custom_id,
            request=types.GenerateContentRequest(
                model="gemini-2.5-flash",
                contents=[
                    types.Content(parts=[
                        types.Part(text=prompt),
                        types.Part(inline_data=types.Blob(
                            mime_type="image/png",
                            data=img_bytes
                        ))
                    ])
                ]
            )
        ))

    # Submit batch job
    batch_job = client.batches.create(
        model="gemini-2.5-flash",
        requests=requests,
        config=types.CreateBatchJobConfig(
            display_name="book_translation"
        )
    )

    # Save to database
    save_batch_job(batch_job.name, len(images))

    return batch_job.name


def check_batch_status(job_id: str) -> dict:
    """
    Check if batch job is complete.
    Returns status dict with state and progress.
    """
    client = get_client()

    try:
        job = client.batches.get(name=job_id)

        return {
            "status": job.state.name if hasattr(job.state, 'name') else str(job.state),
            "completed": getattr(job, 'succeeded_request_count', 0) or 0,
            "failed": getattr(job, 'failed_request_count', 0) or 0,
            "total": getattr(job, 'total_request_count', 0) or 0,
            "error": None
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "completed": 0,
            "failed": 0,
            "total": 0,
            "error": str(e)
        }


def get_batch_results(job_id: str) -> list[dict]:
    """
    Retrieve results from completed batch job.
    Returns list of dicts with custom_id and parsed translation result.
    """
    client = get_client()

    results = []
    for result in client.batches.list_results(name=job_id):
        try:
            parsed = parse_json_response(result.response.text)
            results.append({
                "custom_id": result.custom_id,
                "extracted_text": parsed.get("extracted_text", ""),
                "translations": parsed.get("translations", []),
                "error": None
            })
        except Exception as e:
            results.append({
                "custom_id": result.custom_id,
                "extracted_text": "",
                "translations": [],
                "error": str(e)
            })

    # Sort by custom_id to maintain page order
    results.sort(key=lambda x: x["custom_id"])

    return results


def process_batch_results(
    job_id: str,
    images: list[tuple[str, Image.Image]],
    verify: bool = False,
    progress_callback: Optional[callable] = None
) -> list[tuple[str, Image.Image, dict]]:
    """
    Process batch results: retrieve translations and run image editing.

    Args:
        job_id: Batch job ID
        images: Original images as list of (filename, PIL Image) tuples
        verify: Whether to run verification
        progress_callback: Optional callback(current, total) for progress updates

    Returns:
        List of (filename, translated_image, result_dict) tuples
    """
    # Get batch results
    batch_results = get_batch_results(job_id)

    # Create mapping from custom_id to original image
    image_map = {}
    for i, (filename, image) in enumerate(images):
        custom_id = f"page_{i:04d}_{Path(filename).stem}"
        image_map[custom_id] = (filename, image)

    # Process each result
    output = []
    total = len(batch_results)

    for i, result in enumerate(batch_results):
        custom_id = result["custom_id"]
        filename, original_image = image_map.get(custom_id, (custom_id, None))

        if original_image is None:
            continue

        result_dict = {
            "status": "completed",
            "verification": None,
            "error": result.get("error")
        }

        if result["error"]:
            result_dict["status"] = "failed"
            output.append((filename, original_image, result_dict))
            continue

        try:
            translations = result["translations"]

            # Edit image with Hebrew text
            if translations:
                translated_image = edit_image_with_hebrew(original_image, translations)
            else:
                translated_image = original_image

            # Optional verification
            if verify and translations:
                verification = verify_translation(original_image, translated_image)
                result_dict["verification"] = verification
                if not verification.get("pass", True):
                    result_dict["status"] = "needs_review"

            output.append((filename, translated_image, result_dict))

        except Exception as e:
            result_dict["status"] = "failed"
            result_dict["error"] = str(e)
            output.append((filename, original_image, result_dict))

        # Progress callback
        if progress_callback:
            progress_callback(i + 1, total)

    # Update job status
    update_batch_job_status(job_id, "completed", len(output))

    return output
