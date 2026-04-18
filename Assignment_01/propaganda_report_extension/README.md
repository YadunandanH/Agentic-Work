# Youtube Link

https://youtu.be/c8EZ4ijCjMk

# Narrative Report Generator Chrome Extension

A simple Chrome extension that accepts:
- a public URL
- manual pasted text

It then combines the source text and sends it to a **local Ollama model** to generate a structured JSON report for narrative / propaganda-style marker detection.

## Features

- Accepts pasted text and/or a URL
- Extracts readable text from common article pages
- Calls local Ollama at `http://localhost:11434/api/generate`
- Uses structured JSON output for easier downstream use
- Lets you copy or download the generated report

## Default model

The popup defaults to:
- `llama3.2`

You can change this to any Ollama model you have already pulled locally.

Examples:
- `llama3.2`
- `llama3.1:8b`
- `mistral`
- `gemma3`

## How to run

### 1. Install and start Ollama
Make sure Ollama is installed and running on your machine.

Example:
```bash
ollama run llama3.2
```

### 2. Load the extension in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

### 3. Use it
1. Click the extension icon
2. Enter a public URL and/or paste text
3. Optionally click **Fetch URL text** to preview extraction
4. Click **Generate report**

## Notes and limitations

- URL extraction works best for standard public article pages.
- Some sites block fetching, require login, or render content heavily with JavaScript.
- For X or paywalled pages, pasting the text manually is usually more reliable.
- The generated report is only as good as the local model and the source text quality.

## Suggested next improvements

- Add side panel UI instead of popup
- Add Markdown report export
- Add sentence-level highlighting
- Add comparison mode for two articles
- Add YouTube transcript support
