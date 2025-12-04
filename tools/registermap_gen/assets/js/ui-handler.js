// UI Handler - Manages all UI interactions

class UIHandler {
    constructor() {
    this.currentInputMethod = 'upload';
    // store uploaded regs.json file (no processing on client)
    this.uploadedRegsFile = null;
    // Removed csrconfig file logic
        this.registers = [];
        this.initializeComponents();
        this.attachEventListeners();
    }

    initializeComponents() {
        // Initialize Material Design Components
        const buttons = document.querySelectorAll('.mdc-button');
        buttons.forEach(button => mdc.ripple.MDCRipple.attachTo(button));

        const radios = document.querySelectorAll('.mdc-radio');
        radios.forEach(radio => new mdc.radio.MDCRadio(radio));

        const checkboxes = document.querySelectorAll('.mdc-checkbox');
        checkboxes.forEach(checkbox => new mdc.checkbox.MDCCheckbox(checkbox));

        const textFields = document.querySelectorAll('.mdc-text-field');
        textFields.forEach(field => new mdc.textField.MDCTextField(field));

        const selects = document.querySelectorAll('.mdc-select');
        selects.forEach(select => new mdc.select.MDCSelect(select));

        // Initialize tab bar
        const tabBar = new mdc.tabBar.MDCTabBar(document.querySelector('.mdc-tab-bar'));
        tabBar.listen('MDCTabBar:activated', (event) => {
            this.switchTab(event.detail.index);
        });

        // Initialize snackbar
        this.snackbar = new mdc.snackbar.MDCSnackbar(document.querySelector('.mdc-snackbar'));
    }

    attachEventListeners() {
        // Input method toggle
        document.querySelectorAll('input[name="input-method"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.toggleInputMethod(e.target.value));
        });

        // File upload
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const browseButton = document.getElementById('browse-button');
        // Removed csrconfig event listeners and logic

        if (dropZone) {
            // Allow clicking the drop-area to open file browser as well
            dropZone.addEventListener('click', (e) => {
                if (fileInput) fileInput.click();
            });

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer && (e.dataTransfer.dropEffect = 'copy');
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', (e) => {
                // Only remove class when leaving the element (not child elements)
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                this.handleFileDrop(e);
            });
        }

        // Add register button
        document.getElementById('add-register-btn').addEventListener('click', () => {
            this.addRegister();
        });

        // Generate button
        document.getElementById('generate-btn').addEventListener('click', () => {
            this.generateOutputs();
        });

        // Download all button
        document.getElementById('download-all-btn').addEventListener('click', () => {
            this.downloadAllFiles();
        });

        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    toggleInputMethod(method) {
        this.currentInputMethod = method;
        
        if (method === 'upload') {
            document.getElementById('upload-section').style.display = 'block';
            document.getElementById('gui-section').style.display = 'none';
        } else {
            document.getElementById('upload-section').style.display = 'none';
            document.getElementById('gui-section').style.display = 'block';
            
            // Add initial register if none exist
            if (this.registers.length === 0) {
                this.addRegister();
            }
        }
        
        this.updateGenerateButton();
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.loadJsonFile(file);
        }
    }

    handleFileDrop(event) {
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        console.debug('[UI] File dropped:', file && { name: file.name, type: file.type });
        if (!file) {
            showSnackbar('No file found in drop event', true);
            return;
        }

        // Accept by MIME type or by filename extension (.json)
        const isJson = (file.type && file.type === 'application/json') || (file.name && file.name.toLowerCase().endsWith('.json'));
        if (isJson) {
            this.loadJsonFile(file);
        } else {
            showSnackbar('Please drop a JSON file', true);
        }
    }

    loadJsonFile(file) {
        // Do NOT parse regs.json on the client. Store the File object and show its name.
        this.uploadedRegsFile = file;
        const nameEl = document.getElementById('file-name');
        if (nameEl) nameEl.textContent = file.name;
        const infoEl = document.getElementById('file-info');
        if (infoEl) infoEl.style.display = 'block';
        showSnackbar('Selected regs.json: ' + file.name);
        this.updateGenerateButton();
        
        // Read and display JSON preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            try {
                // Try to parse and format the JSON for better display
                const jsonObj = JSON.parse(content);
                const formattedJson = JSON.stringify(jsonObj, null, 2);
                updateJsonPreview(formattedJson);
            } catch (err) {
                // If parsing fails, just display the raw content
                updateJsonPreview(content);
            }
        };
        reader.onerror = () => {
            updateJsonPreview('Error reading file');
        };
        reader.readAsText(file);
    }

    addRegister() {
        const registerId = 'reg_' + Date.now();
        const registerNumber = this.registers.length;
        
        const registerCard = document.createElement('div');
        registerCard.className = 'register-card';
        registerCard.id = registerId;
        registerCard.innerHTML = `
            <div class="register-header">
                <h3>Register ${registerNumber}</h3>
                <button class="mdc-icon-button material-icons" onclick="uiHandler.removeRegister('${registerId}')">
                    delete
                </button>
            </div>
            <div class="config-row">
                <div class="mdc-text-field mdc-text-field--outlined">
                    <input type="text" class="mdc-text-field__input reg-name" value="REG_${registerNumber}">
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <label class="mdc-floating-label">Register Name</label>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>
                <div class="mdc-text-field mdc-text-field--outlined">
                    <input type="text" class="mdc-text-field__input reg-address" value="0x${(registerNumber * 4).toString(16).padStart(4, '0')}">
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <label class="mdc-floating-label">Address</label>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>
                <div class="mdc-text-field mdc-text-field--outlined">
                    <input type="text" class="mdc-text-field__input reg-reset" value="0x00000000">
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <label class="mdc-floating-label">Reset Value</label>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>
            </div>
            <div class="mdc-text-field mdc-text-field--outlined" style="width: 100%; margin-bottom: 16px;">
                <input type="text" class="mdc-text-field__input reg-description" value="Register ${registerNumber} description">
                <div class="mdc-notched-outline">
                    <div class="mdc-notched-outline__leading"></div>
                    <div class="mdc-notched-outline__notch">
                        <label class="mdc-floating-label">Description</label>
                    </div>
                    <div class="mdc-notched-outline__trailing"></div>
                </div>
            </div>
            <div class="fields-container"></div>
            <button class="mdc-button mdc-button--outlined" onclick="uiHandler.addField('${registerId}')">
                <span class="mdc-button__ripple"></span>
                <i class="material-icons mdc-button__icon">add</i>
                <span class="mdc-button__label">Add Field</span>
            </button>
        `;
        
        document.getElementById('registers-container').appendChild(registerCard);
        
        // Initialize MDC components
        registerCard.querySelectorAll('.mdc-text-field').forEach(field => {
            new mdc.textField.MDCTextField(field);
        });
        
        registerCard.querySelectorAll('.mdc-button').forEach(button => {
            mdc.ripple.MDCRipple.attachTo(button);
        });
        
        this.registers.push(registerId);
        
        // Add initial field
        this.addField(registerId);
        
        this.updateGenerateButton();
    }

    removeRegister(registerId) {
        document.getElementById(registerId).remove();
        this.registers = this.registers.filter(id => id !== registerId);
        this.updateGenerateButton();
    }

    addField(registerId) {
        const registerCard = document.getElementById(registerId);
        const fieldsContainer = registerCard.querySelector('.fields-container');
        const fieldNumber = fieldsContainer.children.length;
        const fieldId = registerId + '_field_' + Date.now();
        
        const fieldCard = document.createElement('div');
        fieldCard.className = 'field-card';
        fieldCard.id = fieldId;
        fieldCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong>Field ${fieldNumber}</strong>
                <button class="mdc-icon-button material-icons" style="padding: 4px;" onclick="uiHandler.removeField('${fieldId}')">
                    close
                </button>
            </div>
            <div class="field-row">
                <div class="mdc-text-field mdc-text-field--outlined">
                    <input type="text" class="mdc-text-field__input field-name" value="FIELD_${fieldNumber}">
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <label class="mdc-floating-label">Field Name</label>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>
                <div class="mdc-text-field mdc-text-field--outlined">
                    <input type="text" class="mdc-text-field__input field-bits" value="${fieldNumber}">
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <label class="mdc-floating-label">Bit(s)</label>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>
                <div class="mdc-text-field mdc-text-field--outlined">
                    <input type="text" class="mdc-text-field__input field-access" value="RW">
                    <div class="mdc-notched-outline">
                        <div class="mdc-notched-outline__leading"></div>
                        <div class="mdc-notched-outline__notch">
                            <label class="mdc-floating-label">Access</label>
                        </div>
                        <div class="mdc-notched-outline__trailing"></div>
                    </div>
                </div>
            </div>
        `;
        
        fieldsContainer.appendChild(fieldCard);
        
        // Initialize MDC components
        fieldCard.querySelectorAll('.mdc-text-field').forEach(field => {
            new mdc.textField.MDCTextField(field);
        });
    }

    removeField(fieldId) {
        document.getElementById(fieldId).remove();
    }

    buildConfigFromGUI() {
        const config = {
            name: document.getElementById('regmap-name').value,
            base_address: parseInt(document.getElementById('input-base-address').value, 16),
            read_filler: parseInt(document.getElementById('input-read-filler').value, 16),
            data_width: 32,
            address_width: 32,
            registers: []
        };
        
        this.registers.forEach(regId => {
            const regCard = document.getElementById(regId);
            if (!regCard) return;
            
            const register = {
                name: regCard.querySelector('.reg-name').value,
                address: parseInt(regCard.querySelector('.reg-address').value, 16),
                description: regCard.querySelector('.reg-description').value,
                reset: parseInt(regCard.querySelector('.reg-reset').value, 16),
                fields: []
            };
            
            regCard.querySelectorAll('.field-card').forEach(fieldCard => {
                const field = {
                    name: fieldCard.querySelector('.field-name').value,
                    bits: fieldCard.querySelector('.field-bits').value,
                    access: fieldCard.querySelector('.field-access').value
                };
                register.fields.push(field);
            });
            
            config.registers.push(register);
        });
        
        return config;
    }

    async generateOutputs() {
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.disabled = true;
            const label = generateBtn.querySelector('.mdc-button__label');
            if (label) label.textContent = 'Generating...';
        }

        try {
            let config;
            let regsJsonContent = null; // raw content to send to Python

            if (this.currentInputMethod === 'upload') {
                if (!this.uploadedRegsFile) {
                    showSnackbar('No file uploaded', true);
                    return;
                }
                // Read raw regs.json content without parsing
                regsJsonContent = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (err) => reject(err);
                    reader.readAsText(this.uploadedRegsFile);
                });
                console.debug('[UI] Uploaded regs.json (raw length):', regsJsonContent.length);
                var regsFilename = this.uploadedRegsFile.name || 'regs.json';
            } else {
                config = this.buildConfigFromGUI();
                regsJsonContent = JSON.stringify(config);
            }

            const options = {
                vhdl: true,  // Always generate VHDL
                c: true,     // Always generate C header
                docs: true,  // Always generate documentation
                axil: true   // Always generate AXI-Lite interface
            };
            
            // Get base_address and read_filler from UI
            const baseAddress = document.getElementById('input-base-address')?.value || '0x00000000';
            const readFiller = document.getElementById('input-read-filler')?.value || '0xdeadbeef';

            console.debug('[UI] Generation options:', options);
            console.debug('[UI] Base address:', baseAddress, 'Read filler:', readFiller);

            // Call generation with base_address and read_filler
            const result = await runCorsairGeneration(regsJsonContent, options, baseAddress, readFiller);
            console.debug('[UI] Generation result:', result);

            if (result && result.success) {
                this.displayOutputs(result.outputs || {});
                const outSec = document.getElementById('output-section');
                if (outSec) outSec.style.display = 'block';
                showSnackbar('Register map generated successfully!');
                const outEl = document.getElementById('output-section');
                if (outEl) outEl.scrollIntoView({ behavior: 'smooth' });
            } else if (result) {
                console.error('[UI] Generation error:', result.error);
                showSnackbar('Generation error: ' + (result.error || 'Unknown error'), true);
            } else {
                showSnackbar('Generation failed: no response from Python', true);
            }
        } catch (error) {
            console.error('[UI] Error:', error);
            showSnackbar('Error: ' + (error && error.message ? error.message : String(error)), true);
        } finally {
            if (generateBtn) {
                generateBtn.disabled = false;
                const label = generateBtn.querySelector('.mdc-button__label');
                if (label) label.textContent = 'Generate Register Map';
            }
        }
    }

    displayOutputs(outputs) {
        const vhdlCodeEl = document.getElementById('output-vhdl-code');
        if (outputs.vhdl && outputs.vhdl.trim()) {
            vhdlCodeEl.textContent = outputs.vhdl;
        } else {
            vhdlCodeEl.textContent = 'No VHDL output generated.';
        }
        Prism.highlightElement(vhdlCodeEl);

        const cCodeEl = document.getElementById('output-c-code');
        if (outputs.c && outputs.c.trim()) {
            cCodeEl.textContent = outputs.c;
        } else {
            cCodeEl.textContent = 'No C header output generated.';
        }
        Prism.highlightElement(cCodeEl);

        const docsCodeEl = document.getElementById('output-docs-code');
        if (outputs.docs && outputs.docs.trim()) {
            docsCodeEl.textContent = outputs.docs;
        } else {
            docsCodeEl.textContent = 'No documentation output generated.';
        }
        Prism.highlightElement(docsCodeEl);
        
        // Store outputs for download
        // If Python returned generated files as base64, decode and expose them
        if (outputs.files) {
            outputs._decodedFiles = {};
            Object.keys(outputs.files).forEach(name => {
                try {
                    const b64 = outputs.files[name];
                    const bytes = atob(b64);
                    // Convert to Uint8Array
                    const arr = new Uint8Array(bytes.length);
                    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                    outputs._decodedFiles[name] = arr;
                } catch (e) {
                    console.warn('Failed to decode generated file', name, e);
                }
            });
        }

        // Display testbench content - moved after file decoding
        const testbenchCodeEl = document.getElementById('output-testbench-code');
        if (outputs.testbench && outputs.testbench.trim()) {
            testbenchCodeEl.textContent = outputs.testbench;
        } else if (outputs._decodedFiles && outputs._decodedFiles['hw/tb_regs.vhd']) {
            // Try to decode from files if not directly provided
            try {
                const decoder = new TextDecoder('utf-8');
                const content = decoder.decode(outputs._decodedFiles['hw/tb_regs.vhd']);
                testbenchCodeEl.textContent = content;
            } catch (e) {
                testbenchCodeEl.textContent = 'Testbench file available in download package.';
            }
        } else {
            testbenchCodeEl.textContent = 'No testbench output generated.';
        }
        Prism.highlightElement(testbenchCodeEl);

        window.generatedOutputs = outputs;

        // Display generated files list
        const filesListEl = document.getElementById('generated-files-list');
        if (filesListEl) {

            filesListEl.innerHTML = '';
                    this.switchTab(0);
            if (outputs._decodedFiles && Object.keys(outputs._decodedFiles).length > 0) {
                Object.keys(outputs._decodedFiles).forEach(name => {
                    const size = outputs._decodedFiles[name].length;
                    const li = document.createElement('li');
                    li.textContent = `${name} (${size} bytes)`;
                    filesListEl.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No additional files generated';
                filesListEl.appendChild(li);
            }
        }
    }

    switchTab(index) {
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        const panels = ['tab-vhdl', 'tab-testbench', 'tab-c', 'tab-docs'];
        document.getElementById(panels[index]).classList.add('active');
    }

    updateGenerateButton() {
        const generateBtn = document.getElementById('generate-btn');
        
        if (this.currentInputMethod === 'upload') {
            generateBtn.disabled = !this.uploadedRegsFile;
        } else {
            generateBtn.disabled = this.registers.length === 0;
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const icon = document.getElementById('theme-toggle');
        icon.textContent = newTheme === 'dark' ? 'brightness_7' : 'brightness_4';
    }

    async downloadAllFiles() {
        if (!window.generatedOutputs) return;
        
        const zip = new JSZip();
        const outputs = window.generatedOutputs;
        
        if (outputs.vhdl) {
            zip.file('regmap.vhd', outputs.vhdl);
        }
        if (outputs.c) {
            zip.file('regmap.h', outputs.c);
        }
        if (outputs.docs) {
            zip.file('regmap.md', outputs.docs);
        }
        // Include any files generated on the Python side
        if (outputs._decodedFiles) {
            Object.keys(outputs._decodedFiles).forEach(name => {
                const arr = outputs._decodedFiles[name];
                zip.file(name, arr);
            });
        }
        
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'regmap_outputs.zip';
        a.click();
        URL.revokeObjectURL(url);
        
        showSnackbar('All files downloaded');
    }
}

// Global instance
let uiHandler;

document.addEventListener('DOMContentLoaded', () => {
    uiHandler = new UIHandler();
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').textContent = 
        savedTheme === 'dark' ? 'brightness_7' : 'brightness_4';
});

