# Corsair Register Map Generator

A browser-based tool for generating VHDL modules, C headers, and documentation from register map specifications using the latest [Corsair (Dzunior/corsair_mod)](https://github.com/Dzunior/corsair_mod) library.

## Features

- 🌐 **Fully Client-Side**: All processing happens in your browser - no server uploads
- 📝 **Upload JSON**: Upload `regs.json` files with register map specifications
- 🎨 **Material Design**: Clean, modern interface following Google's Material Design
- 📦 **Multiple Outputs**: Generate VHDL with AXI-Lite interface, C headers, Markdown and AsciiDoc documentation
- 🔌 **AXI-Lite Support**: VHDL modules include AXI-Lite interface implementation
- 🌓 **Dark Mode**: Toggle between light and dark themes
- 💾 **Batch Download**: Download all generated files including wavedrom diagrams

## Technology Stack

- **Pyodide v0.28.3**: Python runtime in WebAssembly
- **Corsair (Dzunior/corsair_mod)**: Register map generation library (latest version)
- **Material Design Components**: UI framework
- **Jekyll**: Static site generation

## Generated Outputs

The tool generates the following files based on the `regs.json` input:

1. **VHDL Module** (`hw/regs.vhd`) - Register map implementation with AXI-Lite interface
2. **VHDL Testbench** (`hw/tb_regs.vhd`) - AXI-Lite testbench with read/write procedures and automated tests
3. **C Header** (`sw/regs.h`) - Register definitions and access macros for software
4. **Markdown Documentation** (`doc/regs.md`) - Human-readable register map documentation with wavedrom diagrams
5. **AsciiDoc Documentation** (`doc/regs.adoc`) - AsciiDoc format documentation with wavedrom diagrams
6. **Wavedrom Images** - SVG diagrams for register bit field visualization

## Usage

### Upload JSON

1. Upload your `regs.json` file or load the example
2. Configure base address and read filler value
3. Select output options (VHDL, C Header, Documentation)
4. Click "Generate Register Map"

### Configuration

- **Base Address**: Starting address for the register map (hex format, e.g., `0x00000000`)
- **Read Filler**: Value returned when reading undefined register addresses (hex format, e.g., `0xdeadbeef`)

### JSON Format Example

The tool uses the same format as [examples/regmap_json/regs.json](https://github.com/Dzunior/corsair_mod/blob/master/examples/regmap_json/regs.json):

```json
{
  "regmap": [
    {
      "name": "CTRL",
      "description": "Control register",
      "address": 0,
      "bitfields": [
        {
          "name": "ENABLE",
          "description": "Enable bit",
          "reset": 0,
          "width": 1,
          "lsb": 0,
          "access": "rw",
          "hardware": "o",
          "enums": []
        }
      ]
    }
  ]
}
```

## Links

- [Corsair Documentation](https://corsair.readthedocs.io)
- [Dzunior/corsair_mod Repository](https://github.com/Dzunior/corsair_mod)
- [Examples](https://github.com/Dzunior/corsair_mod/tree/master/examples/regmap_json)
