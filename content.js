/* Inject a tooltip and handle selected text */
let tooltip;
let shadowRoot;
let lastSelection = '';

// Safe markdown renderer without innerHTML
function renderMarkdownSafe(text, container) {
  if (!text) return;
  
  container.textContent = '';
  
  // Split text by lines and process each
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.trim() === '') {
      container.appendChild(document.createElement('br'));
      continue;
    }
    
    const p = document.createElement('p');
    p.style.margin = '0';
    p.style.padding = '0';
    
    // Process inline formatting
    let processedText = line;
    const elements = [];
    
    // Handle bold **text**
    processedText = processedText.replace(/\*\*(.*?)\*\*/g, (match, content) => {
      const strong = document.createElement('strong');
      strong.textContent = content;
      elements.push(strong);
      return `__ELEMENT_${elements.length - 1}__`;
    });
    
    // Handle italic *text*
    processedText = processedText.replace(/\*(.*?)\*/g, (match, content) => {
      const em = document.createElement('em');
      em.textContent = content;
      elements.push(em);
      return `__ELEMENT_${elements.length - 1}__`;
    });
    
    // Handle code `text`
    processedText = processedText.replace(/`(.*?)`/g, (match, content) => {
      const code = document.createElement('code');
      code.textContent = content;
      code.style.backgroundColor = '#f0f0f0';
      code.style.padding = '2px 4px';
      code.style.borderRadius = '3px';
      elements.push(code);
      return `__ELEMENT_${elements.length - 1}__`;
    });
    
    // Split by element placeholders and add text/elements
    const parts = processedText.split(/(__ELEMENT_\d+__)/);
    for (const part of parts) {
      if (part.startsWith('__ELEMENT_')) {
        const index = parseInt(part.match(/\d+/)[0]);
        p.appendChild(elements[index]);
      } else if (part) {
        p.appendChild(document.createTextNode(part));
      }
    }
    
    container.appendChild(p);
  }
}

function ensureTooltip() {
  if (tooltip) return;
  const host = document.createElement('div');
  host.id = 'qdae-tooltip-host';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = '0';
  host.style.left = '0';
  host.style.pointerEvents = 'none';
  document.documentElement.appendChild(host);
  shadowRoot = host.attachShadow({ mode: 'open' });

  const wrap = document.createElement('div');
  wrap.id = 'qdae-tooltip';
  wrap.style.pointerEvents = 'auto';
  wrap.style.maxWidth = '360px';
  wrap.style.background = 'rgba(17,24,39,0.98)';
  wrap.style.color = 'white';
  wrap.style.padding = '10px 12px';
  wrap.style.borderRadius = '12px';
  wrap.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';
  wrap.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
  wrap.style.fontSize = '14px';
  wrap.style.display = 'none';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = '0';
  closeBtn.style.background = 'transparent';
  closeBtn.style.color = 'white';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.float = 'right';
  closeBtn.style.marginLeft = '8px';

  const title = document.createElement('div');
  title.textContent = 'Quick Definition';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';

  const content = document.createElement('div');
  content.id = 'qdae-content';
  content.textContent = '...';

  const actions = document.createElement('div');
  actions.style.marginTop = '8px';
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  
  const explainBtn = document.createElement('button');
explainBtn.textContent = 'Explain with AI';
explainBtn.style.border = '0';
explainBtn.style.borderRadius = '8px';
explainBtn.style.padding = '6px 10px';
explainBtn.style.cursor = 'pointer';

// Set the background color to white
explainBtn.style.backgroundColor = 'white';

// Set the text color to black
explainBtn.style.color = 'black';

  actions.appendChild(explainBtn);
  wrap.appendChild(closeBtn);
  wrap.appendChild(title);
  wrap.appendChild(content);
  wrap.appendChild(actions);
  shadowRoot.appendChild(wrap);

  closeBtn.addEventListener('click', (e) => { 
    e.stopPropagation();
    wrap.style.display = 'none';
    // Clear selection to prevent auto-show
    window.getSelection().removeAllRanges();
  });
  explainBtn.addEventListener('click', async () => {
    explainBtn.disabled = true;
    explainBtn.textContent = 'Explaining...';
    try {
      const res = await sendMessageWithRetry({ 
        type: 'AI_EXPLAIN', 
        payload: { 
          text: lastSelection
        } 
      });
      if (res?.ok) {
        if (res.explanation) {
          renderMarkdownSafe(res.explanation, content);
        } else {
          content.textContent = 'No explanation available.';
        }
      } else {
        content.textContent = res?.error || 'AI failed.';
      }
    } catch (error) {
      content.textContent = 'Connection error. Please try again.';
    }
    explainBtn.disabled = false;
    explainBtn.textContent = 'Explain with AI';
  });

  tooltip = wrap;
}

async function showTooltipAt(x, y, text) {
  ensureTooltip();
  const content = shadowRoot.getElementById('qdae-content');
  content.textContent = 'Loading...';
  
  try {
    // Fetch definition with retry logic
    const res = await sendMessageWithRetry({ type: 'DICT_LOOKUP', payload: { text } });
    if (res?.ok) {
      content.textContent = res.definition || 'No definition.';
    } else {
      content.textContent = res?.error || 'Lookup failed.';
    }
  } catch (error) {
    content.textContent = 'Connection error. Try again later.';
  }
  
  tooltip.style.left = `${x + 10}px`;
  tooltip.style.top = `${y + 10}px`;
  tooltip.style.display = 'block';
}

document.addEventListener('mouseup', async (e) => {
  // Small delay to ensure selection is complete
  setTimeout(() => {
    browser.storage.sync.get({ autoLookup: true }).then((data) => {
      if (!data.autoLookup) return;
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0 && sel.length < 200) {
        lastSelection = sel;
        showTooltipAt(e.clientX, e.clientY, sel);
      } else if (!sel && tooltip) {
        tooltip.style.display = 'none';
      }
    }).catch(() => {
      // Ignore storage errors
    });
  }, 50);
});

// Hide tooltip when selection changes or is cleared
document.addEventListener('selectionchange', () => {
  browser.storage.sync.get({ autoLookup: true }).then((data) => {
    if (!data.autoLookup) return;
    const sel = window.getSelection()?.toString().trim();
    if (!sel && tooltip) {
      tooltip.style.display = 'none';
    }
  });
});

/* Listen to messages from background/popup */
browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SHOW_TOOLTIP' && msg.payload?.text) {
    ensureTooltip();
    const content = shadowRoot.getElementById('qdae-content');
    if (msg.payload.text) {
      renderMarkdownSafe(msg.payload.text, content);
    } else {
      content.textContent = 'No content available.';
    }
    
    tooltip.style.left = '20px';
    tooltip.style.top = '20px';
    tooltip.style.display = 'block';
  } else if (msg?.type === 'HIDE_TOOLTIP') {
    if (tooltip) tooltip.style.display = 'none';
  }
});

/* Helper function for reliable messaging */
async function sendMessageWithRetry(message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await browser.runtime.sendMessage(message);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
    }
  }
}

/* Allow popup to get current selection */
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GET_SELECTION') {
    const sel = window.getSelection()?.toString() || '';
    sendResponse({ selection: sel.trim() });
  }
});
