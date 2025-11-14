# Minimal wavedrom shim for Pyodide environment
# Provides a `render` function that returns an object with `.saveas(path)` method.
# This implementation generates proper register bit field SVG visualizations.
import json
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

class _DummySVG:
    def __init__(self, svg_str=''):
        self.svg = svg_str
    def saveas(self, path):
        # Save the SVG string to path
        with open(path, 'w') as f:
            f.write(self.svg)


def render(json_str):
    """Render a WaveDrom register diagram as SVG.
    
    Expected JSON format:
    {
        "reg": [
            {"bits": 8, "name": "field1", "attr": "RW"},
            {"bits": 24, "name": "field2"}
        ],
        "config": {"bits": 32, "lanes": 1, "fontsize": 10}
    }
    """
    try:
        obj = json.loads(json_str)
    except Exception:
        obj = {}
    
    # Extract register fields and config
    reg_fields = obj.get('reg', [])
    config = obj.get('config', {})
    total_bits = config.get('bits', 32)
    fontsize = config.get('fontsize', 10)
    lanes = config.get('lanes', 1)
    
    if not reg_fields:
        # Create a simple placeholder if no fields defined
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60"><rect width="100%" height="100%" fill="#f8f9fa" stroke="#333"/><text x="10" y="30" font-size="12">No register fields defined</text></svg>'
        return _DummySVG(svg)
    
    # Generate SVG for register bit fields
    svg = _generate_register_svg(reg_fields, total_bits, fontsize, lanes)
    return _DummySVG(svg)


def _generate_register_svg(fields, total_bits, fontsize, lanes):
    """Generate SVG representation of register bit fields."""
    
    # SVG dimensions and styling constants
    BIT_WIDTH_PX = 20  # Width per bit in pixels
    LANE_HEIGHT_PX = 60  # Height per lane
    MARGIN_PX = 20
    BIT_NUMBER_SPACE_PX = 30  # Extra space for bit numbers
    
    # Calculate total width based on total bits
    svg_width = total_bits * BIT_WIDTH_PX + 2 * MARGIN_PX
    svg_height = lanes * LANE_HEIGHT_PX + 2 * MARGIN_PX + BIT_NUMBER_SPACE_PX
    
    # Start building SVG
    svg_parts = []
    svg_parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" viewBox="0 0 {svg_width} {svg_height}">')
    
    # Add styles
    svg_parts.append(f'''
    <defs>
        <style type="text/css">
            .field-box {{ fill: #e8f4f8; stroke: #4a90e2; stroke-width: 1.5; }}
            .reserved-box {{ fill: #f0f0f0; stroke: #999; stroke-width: 1; stroke-dasharray: 3,3; }}
            .field-text {{ font-family: Arial, sans-serif; font-size: {fontsize}px; fill: #333; text-anchor: middle; }}
            .attr-text {{ font-family: Arial, sans-serif; font-size: {fontsize - 2}px; fill: #666; text-anchor: middle; font-style: italic; }}
            .bit-text {{ font-family: monospace; font-size: {fontsize - 2}px; fill: #666; text-anchor: middle; }}
        </style>
    </defs>
    ''')
    
    # Draw register fields
    x_offset = MARGIN_PX
    y_offset = MARGIN_PX + 20  # Leave space for top bit numbers
    
    current_bit = total_bits  # Start from MSB
    
    for field in fields:
        bits = field.get('bits', 1)
        name = field.get('name', '')
        attr = field.get('attr', '')
        
        
        # Calculate field width
        field_width = bits * BIT_WIDTH_PX
        
        # Determine if this is a reserved field
        is_reserved = name == '' or name.lower() == 'reserved' or name.lower().startswith('reserved')
        
        # Draw field rectangle
        box_class = 'reserved-box' if is_reserved else 'field-box'
        svg_parts.append(f'<rect x="{x_offset}" y="{y_offset}" width="{field_width}" height="{LANE_HEIGHT_PX}" class="{box_class}"/>')
        
        # Add field name (centered in the field)
        text_x = x_offset + field_width / 2
        text_y = y_offset + LANE_HEIGHT_PX / 2 - 2
        
        if name and not is_reserved:
            # Escape name and attr to prevent XML/SVG injection
            escaped_name = escape(name)
            # Split long names if needed
            svg_parts.append(f'<text x="{text_x}" y="{text_y}" class="field-text">{escaped_name}</text>')
            
            # Add attribute below name if present
            if attr:
                escaped_attr = escape(attr)
                attr_y = text_y + fontsize + 2
                svg_parts.append(f'<text x="{text_x}" y="{attr_y}" class="attr-text">{escaped_attr}</text>')
        
        # Add bit numbers at top and bottom
        start_bit = current_bit - 1
        end_bit = current_bit - bits
        
        # Top bit number(s)
        if bits == 1:
            svg_parts.append(f'<text x="{text_x}" y="{y_offset - 5}" class="bit-text">{start_bit}</text>')
        else:
            # Show range
            svg_parts.append(f'<text x="{x_offset + 5}" y="{y_offset - 5}" class="bit-text">{start_bit}</text>')
            svg_parts.append(f'<text x="{x_offset + field_width - 5}" y="{y_offset - 5}" class="bit-text">{end_bit}</text>')
        
        # Bottom bit number(s) 
        bottom_y = y_offset + LANE_HEIGHT_PX + 12
        if bits == 1:
            svg_parts.append(f'<text x="{text_x}" y="{bottom_y}" class="bit-text">{start_bit}</text>')
        else:
            svg_parts.append(f'<text x="{x_offset + 5}" y="{bottom_y}" class="bit-text">{start_bit}</text>')
            svg_parts.append(f'<text x="{x_offset + field_width - 5}" y="{bottom_y}" class="bit-text">{end_bit}</text>')
        
        # Move to next field
        x_offset += field_width
        current_bit -= bits
    
    svg_parts.append('</svg>')
    
    return ''.join(svg_parts)
