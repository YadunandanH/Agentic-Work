const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';

const STORAGE_KEYS = {
  model: 'model',
  url: 'url',
  text: 'text'
};

const elements = {
  model: document.getElementById('model'),
  url: document.getElementById('url'),
  text: document.getElementById('text'),
  fetchBtn: document.getElementById('fetchBtn'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
  sourcePreview: document.getElementById('sourcePreview'),
  report: document.getElementById('report'),
  reportContainer: document.getElementById('reportContainer')
};

init().catch((error) => setStatus(`Initialization failed: ${error.message}`, true));

elements.fetchBtn.addEventListener('click', () => runWithBusyState(fetchAndPreviewUrlText));
elements.analyzeBtn.addEventListener('click', () => runWithBusyState(generateReport));
elements.copyBtn.addEventListener('click', copyReport);
elements.downloadBtn.addEventListener('click', downloadReport);

[elements.model, elements.url, elements.text].forEach((el) => {
  el.addEventListener('change', saveInputs);
  el.addEventListener('input', debounce(saveInputs, 300));
});

async function init() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  elements.model.value = stored[STORAGE_KEYS.model] || 'llama3.2:3b';
  elements.url.value = stored[STORAGE_KEYS.url] || '';
  elements.text.value = stored[STORAGE_KEYS.text] || '';
  setStatus('Ready.');
}

async function saveInputs() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.model]: elements.model.value.trim(),
    [STORAGE_KEYS.url]: elements.url.value.trim(),
    [STORAGE_KEYS.text]: elements.text.value
  });
}

async function fetchAndPreviewUrlText() {
  const url = elements.url.value.trim();
  if (!url) {
    throw new Error('Enter a URL first.');
  }

  setStatus('Fetching and extracting visible text from URL...');
  const extracted = await extractArticleFromUrl(url);

  const preview = buildCombinedSource({
    pageTitle: extracted.title,
    pageText: extracted.text,
    manualText: elements.text.value.trim()
  });

  elements.sourcePreview.value = preview;
  setStatus(`Fetched ${extracted.text.length.toLocaleString()} characters from URL.`);
}

async function generateReport() {
  const model = elements.model.value.trim() || 'llama3.2:3b';
  const url = elements.url.value.trim();
  const manualText = elements.text.value.trim();

  let pageTitle = '';
  let pageText = '';

  if (url) {
    setStatus('Fetching article text from URL...');
    const extracted = await extractArticleFromUrl(url);
    pageTitle = extracted.title;
    pageText = extracted.text;
  }

  const combinedSource = buildCombinedSource({ pageTitle, pageText, manualText });
  if (!combinedSource.trim()) {
    throw new Error('Provide pasted text and/or a URL with readable text.');
  }

  elements.sourcePreview.value = combinedSource;
  elements.reportContainer.innerHTML = '<p class="placeholder-text" style="color: var(--primary);">Analyzing structure and narratives... Please wait.</p>';
  setStatus(`Calling Ollama model '${model}'... (This may take a minute)`);

  const prompt = buildPrompt({ url, combinedSource });
  const reportMarkdown = await callOllama({ model, prompt });

  elements.report.value = reportMarkdown;

  // Parse the markdown securely and render it
  elements.reportContainer.innerHTML = marked.parse(reportMarkdown);

  setStatus('Report generated successfully.');
}

async function extractArticleFromUrl(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch URL. HTTP ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  stripNoise(doc);

  const title = (doc.querySelector('title')?.textContent || '').trim();
  const text = extractMainText(doc);

  if (!text || text.length < 200) {
    throw new Error(
      'Could not extract enough readable text from the URL. Paste the text manually for this source.'
    );
  }

  return { title, text };
}

function stripNoise(doc) {
  const selectors = [
    'script', 'style', 'noscript', 'svg', 'img', 'video', 'audio', 'iframe',
    'nav', 'footer', 'header', 'aside', 'form', 'button', 'figure',
    '.ad', '.ads', '.advertisement', '.promo', '.newsletter', '.cookie', '.cookies'
  ];

  doc.querySelectorAll(selectors.join(',')).forEach((node) => node.remove());
}

function extractMainText(doc) {
  const candidateSelectors = [
    'article', 'main', '[role="main"]', '.article', '.article-body',
    '.post-content', '.entry-content', '.story-body', '.content'
  ];

  const candidates = [];
  for (const selector of candidateSelectors) {
    doc.querySelectorAll(selector).forEach((node) => candidates.push(node));
  }

  if (candidates.length === 0 && doc.body) {
    candidates.push(doc.body);
  }

  const bestNode = candidates
    .map((node) => ({
      node,
      text: normalizeWhitespace(node.innerText || node.textContent || '')
    }))
    .sort((a, b) => b.text.length - a.text.length)[0];

  let text = bestNode?.text || '';
  if (text.length < 400) {
    text = normalizeWhitespace(doc.body?.innerText || doc.body?.textContent || text);
  }

  return trimText(text, 12000);
}

function buildCombinedSource({ pageTitle, pageText, manualText }) {
  const parts = [];

  if (pageTitle) {
    parts.push(`Page title: ${pageTitle}`);
  }

  if (pageText) {
    parts.push(`Text extracted from URL:\n${pageText}`);
  }

  if (manualText) {
    parts.push(`Manual text:\n${manualText}`);
  }

  return trimText(parts.join('\n\n'), 16000);
}

function buildPrompt({ url, combinedSource }) {
  return [
    'You are an expert political analyst, master of reading between the lines, and a witty reporter!',
    'Your goal is to effortlessly expose the hidden propaganda, narrative biases, and true intentions behind the assigned article.',
    'Make your analysis detailed, super easy to understand, and fun-filled—use an engaging, slightly cheeky tone to keep the reader entertained while dropping truth bombs.',
    '',
    'Read the source material carefully and produce a comprehensive report in beautiful Markdown format.',
    'Structure your report with these exact sections:',
    '',
    '# 🕵️‍♂️ The Propaganda Report: [Give it a catchy, slightly dramatic title]',
    '',
    '## 📝 The TL;DR (Summary)',
    'A quick, engaging summary of what the article actually says vs. what they *want* you to think.',
    '',
    '## 🎭 The Hidden Narrative & Intentions',
    'What is the core narrative they are trying to set? Who are being framed as the "good guys" and the "bad guys"?',
    '',
    '## 🧭 Political Compass & Bias',
    'Where does this fall on the political spectrum? Is it unapologetically right-wing leaning, left-wing leaning, strictly partisan, or something else entirely? Point out the writing styles or dog-whistles that give this away.',
    '',
    '## 🚨 Propaganda Toolkit & Tactics',
    'Identify the specific manipulative tactics used. Look out for and explicitly label things like:',
    '- Minority appeasement or majoritarian pandering',
    '- Framing something as a "threat to national integrity"',
    '- Us-vs-Them polarization',
    '- Fearmongering or moral panic',
    'Make sure to use bullet points and blockquotes (>) to pull EXACT quotes from the text as evidence of their sneaky tactics!',
    '',
    '## 🌶️ The Spice Level (Tone & Emotion)',
    'How emotionally charged is this piece? Is it passive-aggressive, overly dramatic, fearful, or self-righteous?',
    '',
    url ? `Source URL: ${url}` : '',
    '',
    'Source material:',
    combinedSource
  ]
    .filter(Boolean)
    .join('\n');
}

async function callOllama({ model, prompt }) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      keep_alive: '10m'
    })
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Ollama request failed. HTTP ${response.status}. ${rawText}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Ollama returned non-JSON HTTP body: ${rawText}`);
  }

  if (!data.response) {
    throw new Error(`Ollama returned an empty response. Raw payload: ${rawText}`);
  }

  return data.response;
}

async function copyReport() {
  const value = elements.report.value.trim();
  if (!value) {
    setStatus('No report available to copy.', true);
    return;
  }

  await navigator.clipboard.writeText(value);
  setStatus('Markdown report copied to clipboard.');
}

function downloadReport() {
  const value = elements.report.value.trim();
  if (!value) {
    setStatus('No report available to download.', true);
    return;
  }

  const blob = new Blob([value], { type: 'text/markdown' });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = blobUrl;
  anchor.download = `narrative-report-${Date.now()}.md`;
  anchor.click();

  URL.revokeObjectURL(blobUrl);
  setStatus('Downloaded Markdown report.');
}

async function runWithBusyState(fn) {
  setButtonsDisabled(true);
  try {
    await fn();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Something went wrong.', true);
  } finally {
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  elements.fetchBtn.disabled = disabled;
  elements.analyzeBtn.disabled = disabled;
  elements.copyBtn.disabled = disabled;
  elements.downloadBtn.disabled = disabled;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? 'var(--danger)' : '';
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function trimText(text, maxChars) {
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n\n[Truncated for analysis]`
    : text;
}

function debounce(fn, waitMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}