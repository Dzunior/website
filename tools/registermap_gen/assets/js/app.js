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
    simple: {
        name: "simple_regmap",
        base_address: 0,
        data_width: 32,
        registers: [
            {
                name: "CTRL",
                address: 0x0000,
                description: "Control register",
                reset: 0x00000000,
                fields: [
                    {
                        name: "ENABLE",
                        bits: "0",
                        access: "RW",
                        description: "Enable bit"
                    },
                    {
                        name: "MODE",
                        bits: "2:1",
                        access: "RW",
                        description: "Operating mode"
                    }
                ]
            },
            {
                name: "STATUS",
                address: 0x0004,
                description: "Status register",
                reset: 0x00000000,
                fields: [
                    {
                        name: "READY",
                        bits: "0",
                        access: "RO",
                        description: "Ready flag"
                    },
                    {
                        name: "ERROR",
                        bits: "1",
                        access: "RO",
                        description: "Error flag"
                    }
                ]
            }
        ]
    }
};

// Load example
function loadExample(exampleName) {
    if (exampleConfigs[exampleName]) {
        // Create a synthetic File-like Blob so the upload flow can treat examples the same as uploaded files
        const jsonText = JSON.stringify(exampleConfigs[exampleName]);
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
        showSnackbar('Example loaded');
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

console.log('Corsair Register Map Generator initialized');
console.log('Visit https://corsair.readthedocs.io for documentation');
