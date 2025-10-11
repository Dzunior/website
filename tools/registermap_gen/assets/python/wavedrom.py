# Minimal wavedrom shim for Pyodide environment
# Provides a `render` function that returns an object with `.saveas(path)` method.
import json
from xml.etree import ElementTree as ET

class _DummySVG:
    def __init__(self, svg_str=''):
        self.svg = svg_str
    def saveas(self, path):
        # Save the SVG string to path
        with open(path, 'w') as f:
            f.write(self.svg)


def render(json_str):
    try:
        obj = json.loads(json_str)
    except Exception:
        obj = {}
    # Create a simple placeholder SVG representing the register
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60"><rect width="100%" height="100%" fill="#f8f9fa" stroke="#333"/><text x="10" y="30" font-size="12">Wavedrom placeholder</text></svg>'
    return _DummySVG(svg)
