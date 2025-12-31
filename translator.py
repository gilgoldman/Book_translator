"""
Core translation logic for Book Translator.
Handles text extraction, translation, and image editing using Google Gemini.
"""

import json
import re
from typing import Optional

import streamlit as st
from google import genai
from google.genai import types
from PIL import Image
from tenacity import retry, stop_after_attempt, wait_exponential

from database import (
    get_fingerprint,
    check_duplicate,
    register_page,
    record_duplicate,
    mark_completed,
    mark_failed,
    update_verification_status,
)


# Model IDs
MODEL_EXTRACTION = "gemini-2.5-flash"
MODEL_IMAGE_EDIT = "gemini-2.0-flash-exp"  # Image generation model


def get_client() -> genai.Client:
    """Get Gemini client with API key from Streamlit secrets."""
    return genai.Client(api_key=st.secrets["GEMINI_API_KEY"])


def parse_json_response(text: str) -> dict:
    """Parse JSON from Gemini response, handling markdown code blocks."""
    # Remove markdown code blocks if present
    text = text.strip()
    if text.startswith("```"):
        # Remove opening ```json or ```
        text = re.sub(r"^```\w*\n?", "", text)
        # Remove closing ```
        text = re.sub(r"\n?```$", "", text)

    return json.loads(text)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=4, max=60))
def extract_and_translate(image: Image.Image) -> dict:
    """
    Single API call: Extract English text AND translate to Hebrew.
    Returns dict with 'extracted_text' and 'translations' list.
    """
    client = get_client()

    prompt = '''
    1. Extract ALL English text from this image exactly as written.
    2. Translate each text element to Hebrew.

    Return JSON:
    {
        "extracted_text": "full original English text here...",
        "translations": [
            {"english": "Mickey Mouse's Sugar Cookies", "hebrew": "עוגיות הסוכר של מיקי מאוס"},
            {"english": "1 egg", "hebrew": "ביצה אחת"},
            ...
        ]
    }

    If there is no text in the image, return:
    {"extracted_text": "", "translations": []}
    '''

    response = client.models.generate_content(
        model=MODEL_EXTRACTION,
        contents=[prompt, image]
    )

    return parse_json_response(response.text)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=4, max=60))
def edit_image_with_hebrew(image: Image.Image, translations: list) -> Image.Image:
    """
    EDIT the original image - replace English text with Hebrew.
    Uses Gemini's image generation capabilities.
    """
    client = get_client()

    if not translations:
        # No text to translate, return original
        return image

    replacements = "\n".join([
        f'• "{t["english"]}" → "{t["hebrew"]}"'
        for t in translations
    ])

    prompt = f'''
    EDIT THIS IMAGE - DO NOT REGENERATE IT.

    This is a text replacement task. Take the uploaded image and replace
    the English text with Hebrew translations. Everything else must remain
    EXACTLY as it is in the original:

    ✓ Keep the EXACT same illustrations and cartoon characters
    ✓ Keep the EXACT same layout and positioning
    ✓ Keep the EXACT same colors and backgrounds
    ✓ Keep the EXACT same decorative elements
    ✗ Do NOT redraw or reimagine any part of the image
    ✗ Do NOT change anything except the text

    HEBREW TEXT POSITIONING (RTL RULES):
    - Hebrew reads RIGHT-TO-LEFT
    - Titles: Keep centered if originally centered
    - Paragraphs: Flip alignment (left-aligned English → right-aligned Hebrew)
    - Lists/bullet points: Bullets move to the RIGHT side of text
    - Text boxes: Text starts from the RIGHT edge
    - Numbers in recipes (½ cup, 350°F): Keep as-is, they appear correctly in RTL
    - Keep text in the SAME position/area as the original English

    The ONLY change should be: English text → Hebrew text (with proper RTL alignment)

    Text replacements to make:
    {replacements}
    '''

    response = client.models.generate_content(
        model=MODEL_IMAGE_EDIT,
        contents=[prompt, image],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE']
        )
    )

    # Extract image from response
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            import io
            image_bytes = part.inline_data.data
            return Image.open(io.BytesIO(image_bytes))

    raise RuntimeError("No image in response from Gemini")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=4, max=60))
def verify_translation(original: Image.Image, translated: Image.Image) -> dict:
    """
    Compare original and translated images to catch issues.
    Returns verification result with pass/fail and reasons.
    """
    client = get_client()

    prompt = '''
    Compare these two images. The first is the original (English),
    the second is the translated version (Hebrew).

    Check for these issues:
    1. MISSING TRANSLATION: Is any English text still visible in image 2?
    2. BROKEN LAYOUT: Are illustrations/graphics significantly different or distorted?
    3. UNREADABLE TEXT: Is the Hebrew text garbled or incorrectly rendered?
    4. ALIGNMENT ISSUES: Is Hebrew text properly right-aligned where appropriate?

    Respond with JSON:
    {
        "pass": true/false,
        "issues": ["list of issues found, or empty if pass"],
        "confidence": 0.0-1.0
    }

    Be strict - flag anything that looks wrong. It's better to have
    false positives than miss real issues.
    '''

    response = client.models.generate_content(
        model=MODEL_EXTRACTION,
        contents=[prompt, original, translated]
    )

    return parse_json_response(response.text)


def process_single_page(
    image: Image.Image,
    filename: str,
    verify: bool = False
) -> dict:
    """
    Process one page end-to-end.
    Returns dict with status, translated_image, and optional verification result.
    """
    result = {
        "status": "completed",
        "translated_image": None,
        "verification": None,
        "is_duplicate": False,
        "error": None
    }

    try:
        # Step 1: Extract + Translate (one API call)
        extraction = extract_and_translate(image)
        extracted_text = extraction.get("extracted_text", "")
        translations = extraction.get("translations", [])

        # Step 2: Dedup check
        fingerprint = get_fingerprint(extracted_text)
        existing_id = check_duplicate(fingerprint)

        if existing_id:
            record_duplicate(filename, fingerprint, existing_id)
            result["status"] = "duplicate"
            result["is_duplicate"] = True
            # For duplicates, we still need to process the image
            # (the duplicate check is just for tracking)

        # Step 3: Register in DB (if not duplicate)
        if not existing_id:
            page_id = register_page(filename, fingerprint, extracted_text, translations)
        else:
            page_id = None

        # Step 4: Edit image (replace English text with Hebrew)
        if translations:
            translated_image = edit_image_with_hebrew(image, translations)
        else:
            # No text to translate, use original
            translated_image = image

        result["translated_image"] = translated_image

        # Step 5: Optional verification
        if verify and translations:
            verification = verify_translation(image, translated_image)
            result["verification"] = verification

            if page_id:
                update_verification_status(
                    page_id,
                    passed=verification.get("pass", True),
                    issues=verification.get("issues", [])
                )

            if not verification.get("pass", True):
                result["status"] = "needs_review"
                if page_id:
                    mark_completed(page_id, status="needs_review")
                return result

        # Mark as completed
        if page_id:
            mark_completed(page_id)

        return result

    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        return result
