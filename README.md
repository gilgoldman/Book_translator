# Book Translator

A Streamlit app that translates illustrated books from English to Hebrew. Upload book page images, and the app extracts text, translates it, and regenerates each image with Hebrew text while preserving the original artwork.

## Features

- **Text Extraction + Translation**: Uses Gemini 2.5 Flash to extract English text and translate to Hebrew in a single API call
- **Image Editing**: Replaces English text with Hebrew while preserving illustrations using Gemini's image generation
- **Deduplication**: Detects duplicate pages to avoid redundant processing
- **Batch Mode**: Submit large books (50+ pages) for overnight processing at ~50% cost savings
- **Verification** (optional): Checks each translation for quality issues
- **RTL Support**: Proper right-to-left text positioning for Hebrew

## Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/Book_translator.git
   cd Book_translator
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up secrets**
   ```bash
   cp .streamlit/secrets.toml.example .streamlit/secrets.toml
   ```
   Edit `.streamlit/secrets.toml` and add your Gemini API key:
   ```toml
   GEMINI_API_KEY = "your_actual_api_key_here"
   ```

4. **Run the app**
   ```bash
   streamlit run app.py
   ```

### Deploy to Streamlit Cloud

1. **Push to GitHub**
   Ensure your code is in a GitHub repository.

2. **Connect to Streamlit Cloud**
   - Go to [share.streamlit.io](https://share.streamlit.io)
   - Click "New app"
   - Select your repository, branch, and `app.py` as the main file

3. **Configure Secrets**
   - In your app's dashboard, go to **Settings** → **Secrets**
   - Add your secrets in TOML format:
     ```toml
     GEMINI_API_KEY = "your_actual_api_key_here"
     ```

4. **Deploy**
   Click "Deploy" and your app will be live!

## Usage

1. **Upload Pages**: Upload PNG, JPG, or WEBP images of book pages
2. **Choose Mode**:
   - **Real-time**: Instant processing (standard pricing)
   - **Batch**: Overnight processing (~50% cheaper, recommended for 50+ pages)
3. **Optional Verification**: Enable to check each translation for quality (+33% cost)
4. **Start Translation**: Click the button and watch progress
5. **Download**: Get your translated book as a ZIP file

## Project Structure

```
book-translator/
├── app.py              # Streamlit UI (main entry point)
├── translator.py       # Core translation logic (extract, translate, edit)
├── database.py         # In-memory SQLite operations
├── batch.py            # Batch API operations
├── utils.py            # ZIP creation, helpers
├── requirements.txt    # Python dependencies
├── .gitignore
├── .streamlit/
│   └── secrets.toml.example
└── README.md
```

## API Models Used

| Purpose | Model | Notes |
|---------|-------|-------|
| Text extraction + translation | `gemini-2.5-flash` | Fast, cheap OCR + translation |
| Image editing | `gemini-2.0-flash-exp` | Replaces text while preserving artwork |

## Cost Estimation

| Book Size | Real-time Cost | Batch Cost |
|-----------|---------------|------------|
| 20 pages | ~$0.20 | ~$0.10 |
| 100 pages | ~$1.00 | ~$0.50 |
| 500 pages | ~$5.00 | ~$2.50 |

*Estimates based on typical page complexity. Actual costs may vary.*

## Configuration

All configuration is done via Streamlit secrets:

| Secret | Description |
|--------|-------------|
| `GEMINI_API_KEY` | Your Google Gemini API key |

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Limitations

- **Streamlit Cloud**: Files are ephemeral - download your ZIP before closing the session
- **Maximum 500 pages** per upload
- **Session-based**: Progress is lost if the app restarts (use batch mode for large books)
- **Image editing quality**: Complex layouts may require manual review

## License

MIT License
