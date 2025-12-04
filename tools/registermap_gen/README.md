# Corsair Register Map Generator

A browser-based tool for generating VHDL modules, C headers, and documentation from register map specifications using the Corsair library.

## Features

- 🌐 **Fully Client-Side**: All processing happens in your browser - no server uploads
- 📝 **Upload JSON**: Upload `regs.json` files with register map specifications
- 🎨 **Material Design**: Clean, modern interface following Google's Material Design
- 📦 **Multiple Outputs**: Generate VHDL with AXI-Lite interface, C headers, Markdown and AsciiDoc documentation
- 🔌 **AXI-Lite Support**: VHDL modules include AXI-Lite interface implementation
- 🎯 **Xilinx Platform Support**: C headers include optimized functions for Zynq (bare metal) and MicroBlaze
- 🌓 **Dark Mode**: Toggle between light and dark themes
- 💾 **Batch Download**: Download all generated files including wavedrom diagrams

## Technology Stack

- **Pyodide v0.28.3**: Python runtime in WebAssembly
- **Corsair**: Register map generation library (latest version)
- **Material Design Components**: UI framework
- **Jekyll**: Static site generation

## Generated Outputs

The tool generates the following files based on the `regs.json` input:

1. **VHDL Module** (`hw/regs.vhd`) - Register map implementation with AXI-Lite interface
2. **VHDL Testbench** (`hw/tb_regs.vhd`) - AXI-Lite testbench with read/write procedures and automated tests
3. **C Header** (`sw/regs.h`) - Register definitions, access macros, and platform-specific functions for software
4. **Markdown Documentation** (`doc/regs.md`) - Human-readable register map documentation with wavedrom diagrams and C API reference
5. **AsciiDoc Documentation** (`doc/regs.adoc`) - AsciiDoc format documentation with wavedrom diagrams
6. **Wavedrom Images** - SVG diagrams for register bit field visualization

## C Header Features

The generated C header includes:

### Platform-Specific I/O Abstraction

Automatic detection and use of appropriate I/O functions for:
- **Xilinx platforms (MicroBlaze/Zynq/Zynq UltraScale+)**: Uses `Xil_In32()` / `Xil_Out32()` from `xil_io.h`
- **Generic platforms**: Uses volatile pointer access

### Register Access Functions

For each register, the header provides:
- `csr_<register>_read()` - Read the entire register
- `csr_<register>_write(val)` - Write to the register (for writable registers)

### Bitfield Access Functions

For each bitfield, the header provides:
- `csr_<register>_<field>_get()` - Read a specific bitfield
- `csr_<register>_<field>_set(val)` - Write a specific bitfield (read-modify-write)

### Register Map Structure

A packed C structure (`csr_regmap_t`) for direct memory-mapped access:
- `csr_get_regmap()` - Get pointer to the register map structure

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

The tool uses standard Corsair JSON format:

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

### C Header Usage Examples

```c
// Override base address (optional)
#define CSR_BASE_ADDR  0x43C00000UL
#include "regs.h"

// Note: Function names depend on your register map configuration.
// This example assumes a CTRL register with an ENABLE field exists.
void example(void) {
    // Read/write entire register (replace 'ctrl' with your register name)
    uint32_t ctrl = csr_ctrl_read();
    csr_ctrl_write(0x01);
    
    // Read/write specific bitfield (replace 'ctrl_enable' with your field)
    uint32_t enable = csr_ctrl_enable_get();
    csr_ctrl_enable_set(1);
    
    // Direct struct access (member names match register names in lowercase)
    volatile csr_regmap_t* regs = csr_get_regmap();
    regs->ctrl = 0x01;
}
```

## Links

- [Corsair Documentation](https://corsair.readthedocs.io)
