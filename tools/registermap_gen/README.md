# Corsair Register Map Generator

A browser-based tool for generating VHDL modules, C headers, and documentation from register map specifications using the [Corsair](https://corsair.readthedocs.io) library.

## Features

- 🌐 **Fully Client-Side**: All processing happens in your browser - no server uploads
- 📝 **Dual Input Methods**: Upload JSON files or build register maps with GUI
- 🎨 **Material Design**: Clean, modern interface following Google's Material Design
- 📦 **Multiple Outputs**: Generate VHDL, C headers, and Markdown documentation
- 🔌 **AXI-Lite Support**: Generate AXI-Lite interface implementations
- 🌓 **Dark Mode**: Toggle between light and dark themes
- 💾 **Batch Download**: Download all generated files as a ZIP archive

## Technology Stack

- **Pyodide**: Python runtime in WebAssembly
- **Corsair**: Register map generation library
- **Material Design Components**: UI framework
- **Jekyll**: Static site generation

## Usage

### Upload JSON

1. Select "Upload JSON File" input method
2. Drag and drop your `regs.json` file or click to browse
3. Configure output options
4. Click "Generate Register Map"

### GUI Editor

1. Select "Build with GUI Editor" input method
2. Configure register map properties
3. Add registers and fields
4. Configure output options
5. Click "Generate Register Map"

### JSON Format Example

```json
{
  "name": "my_regmap",
  "base_address": 0,
  "data_width": 32,
  "registers": [
    {
      "name": "CTRL",
      "address": 0,
      "description": "Control register",
      "reset": 0,
      "fields": [
        {
          "name": "ENABLE",
          "bits": "0",
          "access": "RW",
          "description": "Enable bit"
        }
      ]
    }
  ]
}
