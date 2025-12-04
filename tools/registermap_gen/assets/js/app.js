// Main Application Logic

// Global variables
window.generatedOutputs = null;

// Snackbar helper
function showSnackbar(message, isError = false) {
    const snackbar = document.querySelector('.mdc-snackbar');
    const label = snackbar.querySelector('.mdc-snackbar__label');
    label.textContent = message;
    
    if (isError) {
        snackbar.classList.add('error');
    } else {
        snackbar.classList.remove('error');
    }
    
    const mdcSnackbar = mdc.snackbar.MDCSnackbar.attachTo(snackbar);
    mdcSnackbar.open();
}

// Download individual file
function downloadFile(type) {
    if (!window.generatedOutputs) return;
    
    const outputs = window.generatedOutputs;
    let content = '';
    let filename = '';
    let mimeType = 'text/plain';
    
    switch(type) {
        case 'vhdl':
            content = outputs.vhdl;
            filename = 'regmap.vhd';
            break;
        case 'c':
            content = outputs.c;
            filename = 'regmap.h';
            break;
        case 'docs':
            content = outputs.docs;
            filename = 'regmap.md';
            break;
    }
    
    if (!content) {
        showSnackbar('No content to download', true);
        return;
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    showSnackbar(`Downloaded ${filename}`);
}

// Example configurations
const exampleConfigs = {
    default: {
        regmap: [
            {
                "name": "DATA",
                "description": "Data register",
                "address": 4,
                "bitfields": [
                    {"name": "FIFO", "description": "Write to push value to TX FIFO, read to get data from RX FIFO", "reset": 0, "width": 8, "lsb": 0, "access": "rw", "hardware": "q", "enums": []},
                    {"name": "FERR", "description": "Frame error flag. Read to clear.", "reset": 0, "width": 1, "lsb": 16, "access": "rolh", "hardware": "i", "enums": []},
                    {"name": "PERR", "description": "Parity error flag. Read to clear.", "reset": 0, "width": 1, "lsb": 17, "access": "rolh", "hardware": "i", "enums": []}
                ]
            },
            {
                "name": "STAT",
                "description": "Status register",
                "address": 12,
                "bitfields": [
                    {"name": "BUSY", "description": "Transciever is busy", "reset": 0, "width": 1, "lsb": 2, "access": "ro", "hardware": "ie", "enums": []},
                    {"name": "RXE", "description": "RX FIFO is empty", "reset": 0, "width": 1, "lsb": 4, "access": "ro", "hardware": "i", "enums": []},
                    {"name": "TXF", "description": "TX FIFO is full", "reset": 0, "width": 1, "lsb": 8, "access": "ro", "hardware": "i", "enums": []}
                ]
            },
            {
                "name": "CTRL",
                "description": "Control register",
                "address": 16,
                "bitfields": [
                    {"name": "BAUD", "description": "Baudrate value", "reset": 0, "width": 2, "lsb": 0, "access": "rw", "hardware": "o", "enums": [
                        {"name": "B9600", "description": "9600 baud", "value": 0},
                        {"name": "B38400", "description": "38400 baud", "value": 1},
                        {"name": "B115200", "description": "115200 baud", "value": 2}
                    ]},
                    {"name": "TXEN", "description": "Transmitter enable. Can be disabled by hardware on error.", "reset": 0, "width": 1, "lsb": 4, "access": "rw", "hardware": "oie", "enums": []},
                    {"name": "RXEN", "description": "Receiver enable. Can be disabled by hardware on error.", "reset": 0, "width": 1, "lsb": 5, "access": "rw", "hardware": "oie", "enums": []},
                    {"name": "TXST", "description": "Force transmission start", "reset": 0, "width": 1, "lsb": 6, "access": "wosc", "hardware": "o", "enums": []}
                ]
            },
            {
                "name": "LPMODE",
                "description": "Low power mode control",
                "address": 20,
                "bitfields": [
                    {"name": "DIV", "description": "Clock divider in low power mode", "reset": 0, "width": 8, "lsb": 0, "access": "rw", "hardware": "o", "enums": []},
                    {"name": "EN", "description": "Low power mode enable", "reset": 0, "width": 1, "lsb": 31, "access": "rw", "hardware": "o", "enums": []}
                ]
            },
            {
                "name": "INTSTAT",
                "description": "Interrupt status register",
                "address": 32,
                "bitfields": [
                    {"name": "TX", "description": "Transmitter interrupt flag. Write 1 to clear.", "reset": 0, "width": 1, "lsb": 0, "access": "rw1c", "hardware": "s", "enums": []},
                    {"name": "RX", "description": "Receiver interrupt. Write 1 to clear.", "reset": 0, "width": 1, "lsb": 1, "access": "rw1c", "hardware": "s", "enums": []}
                ]
            },
            {
                "name": "ID",
                "description": "IP-core ID register",
                "address": 64,
                "bitfields": [
                    {"name": "UID", "description": "Unique ID", "reset": 3405645414, "width": 32, "lsb": 0, "access": "ro", "hardware": "f", "enums": []}
                ]
            }
        ]
    }
};
// Add button to load default example and auto-load it if no file is present
document.addEventListener('DOMContentLoaded', () => {
    // Initialize JSON preview
    updateJsonPreview(null);
    
    // Load example button setup
    const exampleBtn = document.createElement('button');
    exampleBtn.className = 'mdc-button mdc-button--outlined';
    exampleBtn.innerHTML = '<span class="mdc-button__ripple"></span><span class="mdc-button__label">Load Default regs.json</span>';
    exampleBtn.style.marginTop = '12px';
    exampleBtn.onclick = () => loadExample('default');
    const uploadSection = document.getElementById('upload-section');
    if (uploadSection) {
        uploadSection.querySelector('.mdc-card__content').appendChild(exampleBtn);
    }
    // Auto-load default example if no file is present
    setTimeout(() => {
        if (!uiHandler.uploadedRegsFile) {
            loadExample('default');
        }
    }, 300);
    
    // Fetch version information
    fetchVersionInfo();
});

// Load example
function loadExample(exampleName) {
    if (exampleConfigs[exampleName]) {
        // Create a synthetic File-like Blob so the upload flow can treat examples the same as uploaded files
        const jsonText = JSON.stringify(exampleConfigs[exampleName], null, 2);
        const blob = new Blob([jsonText], { type: 'application/json' });
        // create a simple File if supported, otherwise attach the blob and a name
        let fileObj;
        try {
            fileObj = new File([blob], `example-${exampleName}.json`, { type: 'application/json' });
        } catch (e) {
            blob.name = `example-${exampleName}.json`;
            fileObj = blob;
        }
        uiHandler.uploadedRegsFile = fileObj;
        document.getElementById('file-name').textContent = `Example: ${exampleName}`;
        document.getElementById('file-info').style.display = 'block';
        uiHandler.updateGenerateButton();
        updateJsonPreview(jsonText);
        showSnackbar('Example loaded');
    }
}

// Update JSON preview
function updateJsonPreview(jsonText) {
    const previewCode = document.getElementById('json-preview-code');
    if (previewCode) {
        if (jsonText) {
            previewCode.textContent = jsonText;
            // Apply syntax highlighting if Prism is available
            if (typeof Prism !== 'undefined') {
                Prism.highlightElement(previewCode);
            }
        } else {
            previewCode.textContent = 'No file loaded';
        }
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const generateBtn = document.getElementById('generate-btn');
        if (!generateBtn.disabled) {
            uiHandler.generateOutputs();
        }
    }
});

// Fetch and display version information
async function fetchVersionInfo() {
    const CACHE_KEY = 'toolVersionInfo';
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    let cached = null;
    try {
        cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    } catch (e) {
        cached = null;
    }
    const versionEl = document.getElementById('tool-version');
    // Use cached version if it exists and hasn't expired
    if (cached && cached.sha && cached.timestamp && (now - cached.timestamp < CACHE_TTL_MS)) {
        if (versionEl) {
            versionEl.textContent = `v${cached.sha}`;
        }
        return;
    }
    try {
        // Try to get the version from the GitHub API
        const response = await fetch('https://api.github.com/repos/MyliumFPGA/website/commits/HEAD');
        if (response.ok) {
            const data = await response.json();
            const sha = data.sha.substring(0, 7);
            if (versionEl) {
                versionEl.textContent = `v${sha}`;
            }
            // Cache the result
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    sha: sha,
                    timestamp: now
                }));
            } catch (e) {
                // localStorage save failed (private mode, quota exceeded, etc.)
                console.warn('Could not cache version info:', e);
            }
        } else {
            throw new Error('GitHub API response not OK');
        }
    } catch (error) {
        console.warn('Could not fetch version info:', error);
        // Fallback to a static version
        if (versionEl) {
            versionEl.textContent = 'v1.0';
        }
    }
}

console.log('Corsair Register Map Generator initialized');
console.log('Visit https://corsair.readthedocs.io for documentation');
