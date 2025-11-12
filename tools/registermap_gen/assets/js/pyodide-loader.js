// Pyodide Loader and Corsair Setup
// Handles Python environment initialization in the browser

let pyodide = null;
let corsairReady = false;
let loadingAttempts = 0;
const MAX_LOADING_ATTEMPTS = 15;

/**
 * Main initialization function for Pyodide environment
 */
async function initializePyodideEnvironment() {
    const loadingEl = document.getElementById('loading-pyodide');
    const mainContentEl = document.getElementById('main-content');
    
    try {
        console.log('[Pyodide] Starting initialization...');
        updateLoadingStatus('Loading Python runtime...', false);
        
        // Load Pyodide
        pyodide = await window.loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/",
            fullStdLib: false // Only load what we need
        });
        
        console.log('[Pyodide] Runtime loaded successfully');
        updateLoadingStatus('Installing required packages...', false);
        
        // Load micropip for package management
        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");
        console.log('[Pyodide] Micropip loaded');
        
        // Install corsair - try multiple methods
        updateLoadingStatus('Installing Corsair library...', false);
        await installCorsair(micropip);
        
        console.log('[Pyodide] Corsair installed successfully');
        updateLoadingStatus('Initializing generator...', false);
        
        // Load the Python wrapper code
        await pyodide.runPythonAsync(getCorsairWrapper());
        console.log('[Pyodide] Wrapper code loaded');
        
        // Verify everything is working
        const testResult = await pyodide.runPythonAsync(`
import sys
import corsair
result = {
    'python_version': sys.version,
    'corsair_available': True
}
import json
json.dumps(result)
        `);
        
        const testData = JSON.parse(testResult);
        console.log('[Pyodide] Verification successful:', testData);
        
        corsairReady = true;
        
        // Hide loading, show main content
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContentEl) mainContentEl.style.display = 'block';
        
        showSnackbar('Python environment ready!');
        console.log('[Pyodide] ✓ Initialization complete');
        
    } catch (error) {
        console.error('[Pyodide] Initialization failed:', error);
        showLoadingError(error);
        showSnackbar('Failed to load Python environment', true);
    }
}

/**
 * Install corsair from local master.zip file
 */
async function installCorsair(micropip) {
    console.log('[Pyodide] Installing dependencies...');
    
    // Install ALL required dependencies for corsair
    const dependencies = [
        'jinja2',
        'pyyaml', 
        'setuptools',
        // wavedrom handled separately because it has no pure-Python wheel for Pyodide
        'atpublic',  // May be required
        'jsonschema' // May be required
    ];
    
    for (const dep of dependencies) {
        try {
            console.log(`[Pyodide] Installing ${dep}...`);
            await micropip.install(dep);
            console.log(`[Pyodide] ✓ ${dep} installed`);
        } catch (error) {
            console.warn(`[Pyodide] Warning: Could not install ${dep}:`, error.message);

            // If wavedrom failed to install from PyPI, try common fallbacks (git repos or alternate names)
            if (dep === 'wavedrom') {
                const wavedromFallbacks = [
                    'wavedrom',
                    'wavedrom-python',
                    'git+https://github.com/wavedrom/wavedrom-python.git#egg=wavedrom-python',
                    'git+https://github.com/rburchell/wavedrom-python.git#egg=wavedrom-python'
                ];

                let installed = false;
                for (const spec of wavedromFallbacks) {
                    try {
                        if (spec === 'wavedrom') continue; // already tried
                        console.log(`[Pyodide] Trying fallback install for wavedrom: ${spec}`);
                        // prefer invoking micropip via pyodide.runPythonAsync for complex specs to get clearer errors
                        try {
                            await micropip.install(spec);
                        } catch (inner) {
                            console.warn('[Pyodide] micropip.install failed, retrying via runPythonAsync to show details');
                            // run a small Python snippet that uses micropip.install with keep_going=True
                            const pyCmd = `import asyncio, micropip\nasync def run_inst():\n    await micropip.install('${spec}', keep_going=True)\nasyncio.get_event_loop().run_until_complete(run_inst())`;
                            try {
                                await pyodide.runPythonAsync(pyCmd);
                            } catch (pyErr) {
                                console.warn('[Pyodide] runPythonAsync install failed for', spec, pyErr.toString());
                                throw pyErr;
                            }
                        }
                        console.log(`[Pyodide] ✓ Wavedrom installed via ${spec}`);
                        installed = true;
                        break;
                    } catch (fbErr) {
                        console.warn(`[Pyodide] Fallback install failed (${spec}):`, fbErr.message || fbErr);
                        continue;
                    }
                }

                if (!installed) {
                    console.warn('[Pyodide] Warning: wavedrom could not be installed using known fallbacks. This may cause corsair import to fail.');
                }
            }
            // Continue anyway - some dependencies might be optional
        }
    }

    // Handle wavedrom separately: try a quiet install/check and fall back to the local shim if not available
    try {
        console.log('[Pyodide] Checking availability of wavedrom via micropip (keep_going)...');
        const pyCheck = `import micropip, asyncio\nasync def run():\n    try:\n        await micropip.install('wavedrom', keep_going=True)\n        print('MICROPIP_WAVEDROM_OK')\n    except Exception as e:\n        print('MICROPIP_WAVEDROM_FAIL:'+str(e))\nasyncio.get_event_loop().run_until_complete(run())`;
        const checkResult = await pyodide.runPythonAsync(pyCheck);
        if (typeof checkResult === 'string' && checkResult.indexOf('MICROPIP_WAVEDROM_OK') !== -1) {
            console.log('[Pyodide] wavedrom appears installed via micropip');
        } else {
            console.log('[Pyodide] wavedrom is not available as a pure-Python wheel in Pyodide; will use local shim/fallback');
        }
    } catch (err) {
        console.warn('[Pyodide] wavedrom availability check failed, using local shim/fallback:', err);
    }
    
    try {
        console.log('[Pyodide] Loading corsair from local master.zip...');
        
        // Determine URL to the local zip file (try to derive it from the script location)
        let zipUrl = '/tools/registermap_gen/master.zip';
        try {
            const scriptEl = document.querySelector('script[src$="pyodide-loader.js"], script[src*="/pyodide-loader.js"]');
            if (scriptEl && scriptEl.src) {
                const scriptUrlObj = new URL(scriptEl.src, window.location.href);
                // Replace the trailing /assets/js/<file> with /master.zip (covers typical layout)
                scriptUrlObj.pathname = scriptUrlObj.pathname.replace(/\/assets\/js\/[^^/]+$/, '/master.zip');
                zipUrl = scriptUrlObj.toString();
            }
        } catch (e) {
            console.warn('[Pyodide] Could not derive master.zip URL from script tag, using default:', e);
        }

        console.log('[Pyodide] Fetching corsair zip from', zipUrl);
        const response = await fetch(zipUrl);
        if (!response.ok) {
            throw new Error(`Failed to load master.zip: ${response.statusText}`);
        }
        
        const zipData = await response.arrayBuffer();
        console.log(`[Pyodide] Loaded ${zipData.byteLength} bytes from master.zip`);
        
        // Write zip to Pyodide's virtual filesystem
        const zipArray = new Uint8Array(zipData);
        pyodide.FS.writeFile('/tmp/corsair.zip', zipArray);
                // Also attempt to write the local wavedrom shim into Pyodide FS so imports succeed
        try {
            const shimResp = await fetch('/tools/registermap_gen/assets/python/wavedrom.py');
            if (shimResp.ok) {
                const shimText = await shimResp.text();
                pyodide.FS.writeFile('/tmp/wavedrom.py', shimText);
                console.log('[Pyodide] Wrote local wavedrom shim to /tmp/wavedrom.py');
            } else {
                console.warn('[Pyodide] Local wavedrom shim not found at /tools/registermap_gen/assets/python/wavedrom.py');
            }
        } catch (e) {
            console.warn('[Pyodide] Could not fetch/write wavedrom shim:', e);
        }
        
        console.log('[Pyodide] Zip file written to virtual filesystem');
        
        // Extract and install
        await pyodide.runPythonAsync(`
import zipfile
import sys
import os

print("[Python] Extracting corsair from master.zip...")

# Extract the zip file
with zipfile.ZipFile('/tmp/corsair.zip', 'r') as zip_ref:
    zip_ref.extractall('/tmp/corsair_extracted')

# Find the extracted directory
extracted_items = os.listdir('/tmp/corsair_extracted')
print(f"[Python] Extracted items: {extracted_items}")

# Look for the corsair_mod directory (usually corsair_mod-master)
corsair_root = None
for item in extracted_items:
    item_path = os.path.join('/tmp/corsair_extracted', item)
    if os.path.isdir(item_path) and 'corsair' in item.lower():
        corsair_root = item_path
        print(f"[Python] Found corsair root: {corsair_root}")
        break

if not corsair_root:
    raise Exception(f"Could not find corsair directory in extracted files: {extracted_items}")

# Look for the corsair package inside
corsair_package = None
for item in os.listdir(corsair_root):
    item_path = os.path.join(corsair_root, item)
    if os.path.isdir(item_path) and item == 'corsair':
        corsair_package = item_path
        print(f"[Python] Found corsair package: {corsair_package}")
        break

if not corsair_package:
    # Try adding the root directory itself
    print(f"[Python] Adding root directory to path: {corsair_root}")
    sys.path.insert(0, corsair_root)
else:
    # Add the parent directory of corsair package
    parent_dir = os.path.dirname(corsair_package)
    print(f"[Python] Adding parent directory to path: {parent_dir}")
    sys.path.insert(0, parent_dir)

# Ensure the local assets/python directory (written to /tmp/wavedrom.py) is available
local_shim_dir = '/tmp'
if local_shim_dir not in sys.path:
    sys.path.insert(0, local_shim_dir)
    print(f"[Python] Added local shim dir to sys.path: {local_shim_dir}")

# Check available dependencies
print("[Python] Checking dependencies...")
try:
    import jinja2
    print("[Python] ✓ jinja2 available")
except ImportError:
    print("[Python] ✗ jinja2 not available")

try:
    import yaml
    print("[Python] ✓ yaml available")
except ImportError:
    print("[Python] ✗ yaml not available")

try:
    import wavedrom
    print("[Python] ✓ wavedrom available")
except ImportError:
    print("[Python] ✗ wavedrom not available - this may cause issues")

# Try to import corsair
try:
    import corsair
    print(f"[Python] ✓ Corsair imported successfully")
    print(f"[Python] Corsair location: {corsair.__file__ if hasattr(corsair, '__file__') else 'built-in'}")
    
    # Check for key components
    if hasattr(corsair, 'RegisterMap'):
        print("[Python] ✓ RegisterMap class available")
    else:
        print("[Python] ⚠ RegisterMap class not found")
        
    if hasattr(corsair, 'generators'):
        print("[Python] ✓ Generators module available")
    else:
        print("[Python] ⚠ Generators module not found")
        
except ImportError as e:
    print(f"[Python] ✗ Failed to import corsair: {e}")
    print(f"[Python] Current sys.path: {sys.path}")
    
    # Try to provide more detailed error info
    import traceback
    traceback.print_exc()
    raise

print("[Python] Corsair installation complete!")
        `);
        
        console.log('[Pyodide] ✓ Corsair installed successfully from local file');
        
    } catch (error) {
        console.error('[Pyodide] Failed to install corsair from local file:', error);
        throw new Error(
            `Could not install corsair from master.zip\n` +
            `Error: ${error.message}\n\n` +
            `Please ensure:\n` +
            `• master.zip is in /tools/registermap_gen/ directory\n` +
            `• The zip contains the corsair package\n` +
            `• All dependencies are installed\n` +
            `• The file is accessible to the web server`
        );
    }
}


/**
 * Update loading status message
 */
function updateLoadingStatus(message, isError = false) {
    const loadingEl = document.getElementById('loading-pyodide');
    if (!loadingEl) return;
    
    const statusEl = loadingEl.querySelector('p');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#f44336' : '';
    }
}

/**
 * Show error in loading area
 */
function showLoadingError(error) {
    const loadingEl = document.getElementById('loading-pyodide');
    if (!loadingEl) return;
    
    loadingEl.innerHTML = `
        <div style="text-align: center; padding: 48px; max-width: 600px; margin: 0 auto;">
            <span class="material-icons" style="font-size: 64px; color: #f44336;">error</span>
            <h3 style="margin: 16px 0;">Failed to Load Python Environment</h3>
            <p style="color: #666; margin-bottom: 8px;">${error.message}</p>
            <details style="margin: 16px 0; text-align: left; background: #f5f5f5; padding: 12px; border-radius: 4px;">
                <summary style="cursor: pointer; font-weight: 500;">Technical Details</summary>
                <pre style="margin-top: 8px; overflow-x: auto; font-size: 12px;">${error.stack || error.toString()}</pre>
            </details>
            <button class="mdc-button mdc-button--raised" onclick="location.reload()" style="margin-top: 16px;">
                <span class="mdc-button__ripple"></span>
                <span class="mdc-button__label">Retry</span>
            </button>
        </div>
    `;
}

/**
 * Get the Python wrapper code for Corsair
 */
function getCorsairWrapper() {
    return `
import json
import sys
import os
from io import StringIO
import traceback

# Ensure a local wavedrom shim is available so corsair can import it even if micropip install failed
try:
    import wavedrom
    print("[Python] wavedrom available")
except Exception:
    try:
        import importlib.util
        shim_path = '/tmp/wavedrom.py'
        if os.path.exists(shim_path):
            spec = importlib.util.spec_from_file_location('wavedrom', shim_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            import sys as _sys
            _sys.modules['wavedrom'] = mod
            print(f"[Python] Loaded local wavedrom shim from {shim_path}")
        else:
            print(f"[Python] No local wavedrom shim found at {shim_path}")
    except Exception as _e:
        print(f"[Python] Could not load local wavedrom shim: {_e}", file=sys.stderr)

# Import corsair components
try:
    import corsair
    from corsair import RegisterMap
    CORSAIR_AVAILABLE = True
    # Ensure corsair.generators has a Wavedrom class; if not, inject a lightweight fallback
    try:
        import importlib
        genmod = importlib.import_module('corsair.generators')
        if not hasattr(genmod, 'Wavedrom'):
            print('[Python] corsair.generators.Wavedrom missing; injecting fallback')
            class FallbackWavedrom:
                def __init__(self, *args, **kwargs):
                    pass
                def draw_regs(self, imgdir, rmap):
                    try:
                        from pathlib import Path
                        Path(imgdir).mkdir(parents=True, exist_ok=True)
                        import wavedrom
                        import json
                        for reg in rmap:
                            # build a minimal wavedrom JSON for the register
                            reg_wd = {"reg": [], "config": {"bits": 32, "lanes": 1, "fontsize": 10}}
                            # create a simple label
                            reg_wd['reg'].append({"name": getattr(reg, 'name', 'reg'), "bits": 32})
                            svg_obj = wavedrom.render(json.dumps(reg_wd))
                            svg_obj.saveas(str(Path(imgdir) / (getattr(reg, 'name', 'reg').lower() + '.svg')))
                    except Exception as _fw_err:
                        print(f"[Python] FallbackWavedrom draw_regs failed: {_fw_err}", file=sys.stderr)
            genmod.Wavedrom = FallbackWavedrom
    except Exception as _inject_err:
        print(f"[Python] Could not inject fallback Wavedrom: {_inject_err}", file=sys.stderr)
except ImportError as e:
    print(f"ERROR: Could not import corsair: {e}", file=sys.stderr)
    CORSAIR_AVAILABLE = False


def create_regmap_from_regs_json(regs_json_content):
    """Create a Corsair RegisterMap from regs.json"""
    if not CORSAIR_AVAILABLE:
        raise ImportError("Corsair library is not available")

    try:
        # Parse the regs.json content
        regs_data = json.loads(regs_json_content)
        print(f"[Python] Parsed regs.json with {len(regs_data.get('registers', []))} registers")
        
        # Create RegisterMap and load data
        regmap = RegisterMap()
        regmap.load(regs_data)
        print(f"[Python] RegisterMap created with {len(regmap)} registers")
        return regmap
    except Exception as e:
        print(f"[Python] Error creating regmap from JSON: {e}", file=sys.stderr)
        traceback.print_exc()
        # Fallback: create empty regmap
        regmap = RegisterMap()
        return regmap


def create_regmap_from_regs_file(path):
    """Create a Corsair RegisterMap by pointing Corsair at a regs.json file path (no processing).

    This tries common RegisterMap file-loading methods if present, otherwise falls back to parsing the file.
    """
    if not CORSAIR_AVAILABLE:
        raise ImportError("Corsair library is not available")

    try:
        import inspect
        tried = []

        # Candidates to try: top-level corsair.RegisterMap and corsair.generators.RegisterMap
        candidates = []
        try:
            if hasattr(corsair, 'RegisterMap'):
                candidates.append(('corsair', corsair.RegisterMap))
        except Exception:
            pass

        try:
            genmod = __import__('corsair.generators', fromlist=['RegisterMap'])
            if hasattr(genmod, 'RegisterMap'):
                candidates.append(('corsair.generators', genmod.RegisterMap))
        except Exception:
            # ignore
            pass

        # Also include the RegisterMap symbol we may have already imported
        try:
            if 'RegisterMap' in globals() and RegisterMap not in [c[1] for c in candidates]:
                candidates.append(('imported', RegisterMap))
        except Exception:
            pass

        for modname, RMclass in candidates:
            try:
                print(f"[Python] Trying RegisterMap candidate from {modname}: {RMclass}")
                # Try to instantiate directly with path
                try:
                    regmap = RMclass(path)
                    print(f"[Python] Instantiated RegisterMap(path) from {modname}")
                    return regmap
                except Exception as e_inst:
                    print(f"[Python] Constructor(RMclass(path)) failed for {modname}: {e_inst}")

                # Try no-arg constructor then file-based load methods
                try:
                    regmap = RMclass()
                except Exception as e_ctor:
                    print(f"[Python] Default constructor failed for {modname}: {e_ctor}")
                    continue

                # Print available methods for debugging
                available_methods = [m for m in dir(regmap) if not m.startswith('_')]
                print(f"[Python] Available methods on {modname}: {available_methods}")
                
                # Prefer file-based readers if available
                try:
                    if hasattr(regmap, 'read_json'):
                        regmap.read_json(path)
                        print(f"[Python] Loaded RegisterMap via read_json({path}) on {modname}")
                        return regmap
                except Exception as e_rj:
                    print(f"[Python] read_json failed on {modname}: {e_rj}")
                try:
                    if hasattr(regmap, 'read_yaml'):
                        regmap.read_yaml(path)
                        print(f"[Python] Loaded RegisterMap via read_yaml({path}) on {modname}")
                        return regmap
                except Exception as e_ry:
                    print(f"[Python] read_yaml failed on {modname}: {e_ry}")
                try:
                    if hasattr(regmap, 'read_file'):
                        regmap.read_file(path)
                        print(f"[Python] Loaded RegisterMap via read_file({path}) on {modname}")
                        return regmap
                except Exception as e_rf:
                    print(f"[Python] read_file failed on {modname}: {e_rf}")

                # Fallback: Try load(data) if present
                try:
                    with open(path, 'r') as fh:
                        data = json.load(fh)
                    if hasattr(regmap, 'load'):
                        regmap.load(data)
                        print(f"[Python] Loaded RegisterMap by parsing file and using 'load' on {modname}")
                        return regmap
                    else:
                        print(f"[Python] No 'load' method found on {modname}")
                except Exception as e_load:
                    print(f"[Python] Failed to load via 'load' method on {modname}: {e_load}")

            except Exception as outer_e:
                print(f"[Python] Error trying RegisterMap candidate {modname}: {outer_e}")

        print(f"[Python] No suitable RegisterMap loader found after trying: {tried}")
        # Final fallback: return an empty RegisterMap instance
        try:
            return RegisterMap()
        except Exception as final_e:
            print(f"[Python] Could not create empty RegisterMap(): {final_e}", file=sys.stderr)
            raise
    except Exception as e:
        print(f"[Python] Unexpected failure in create_regmap_from_regs_file: {e}", file=sys.stderr)
        traceback.print_exc()
        try:
            return RegisterMap()
        except Exception:
            raise


def generate_outputs(regs_json_content, options, base_address_str='0x00000000', read_filler_str='0xdeadbeef'):
    """
    Generate register map outputs using corsair with csrconfig approach

    Args:
        regs_json_content: JSON string content of regs.json file
        options: Dict with output options (vhdl, c, docs, axil)
        base_address_str: Base address as hex string
        read_filler_str: Read filler value as hex string

    Returns:
        JSON string with generated file contents or error
    """
    try:
        if not CORSAIR_AVAILABLE:
            return json.dumps({
                'success': False,
                'error': 'Corsair library is not available'
            })

        # Options may be passed as a JSON string from JavaScript to avoid JS booleans being evaluated
        if isinstance(options, str):
            try:
                options = json.loads(options)
            except Exception:
                options = {}

        print(f"[Python] Starting generation with options: {options}")
        
        # Parse base_address and read_filler
        try:
            base_address = int(base_address_str, 16) if isinstance(base_address_str, str) else int(base_address_str)
        except:
            base_address = 0
        try:
            read_filler = int(read_filler_str, 16) if isinstance(read_filler_str, str) else int(read_filler_str)
        except:
            read_filler = 0

        # Prepare a dedicated output directory in the Pyodide FS so we can capture any files written
        import shutil, base64
        outdir = os.path.join('/tmp', 'corsair_out')
        # Clean existing outdir
        try:
            if os.path.exists(outdir):
                shutil.rmtree(outdir)
        except Exception:
            pass
        os.makedirs(outdir, exist_ok=True)

        # Write regs.json to the filesystem so corsair can read it
        regs_path = os.path.join(outdir, 'regs.json')
        with open(regs_path, 'w') as f:
            f.write(regs_json_content)
        print(f"[Python] Wrote regs.json to {regs_path}")

        # Change current working directory to outdir
        old_cwd = os.getcwd()
        try:
            os.chdir(outdir)
            print(f"[Python] Changed cwd to {outdir}")
            
            # Read register map
            rmap = RegisterMap()
            rmap.read_file('regs.json')
            print(f"[Python] Loaded register map with {len(rmap)} registers")
            
            # Set global configuration using corsair's config module
            from corsair import config as corsair_config
            globcfg = corsair_config.default_globcfg()
            globcfg['base_address'] = base_address
            globcfg['data_width'] = 32
            globcfg['address_width'] = 16
            globcfg['register_reset'] = 'sync_pos'
            corsair_config.set_globcfg(globcfg)
            print(f"[Python] Set global config: base_address={hex(base_address)}")
            
            # Generate outputs based on options
            from corsair import generators
            outputs = {}
            
            # VHDL module (AXI-Lite interface)
            if options.get('vhdl', True):
                try:
                    print("[Python] Generating VHDL module...")
                    gen = generators.Vhdl(rmap, path='hw/regs.vhd', read_filler=read_filler, interface='axil')
                    gen.generate()
                    with open('hw/regs.vhd', 'r') as f:
                        outputs['vhdl'] = f.read()
                    print(f"[Python] ✓ VHDL module generated ({len(outputs['vhdl'])} chars)")
                except Exception as e:
                    print(f"[Python] VHDL generation error: {e}")
                    traceback.print_exc()
                    outputs['vhdl'] = f"Error generating VHDL: {e}"
            
            # C header
            if options.get('c', True):
                try:
                    print("[Python] Generating C header...")
                    gen = generators.CHeader(rmap, path='sw/regs.h', prefix='CSR')
                    gen.generate()
                    with open('sw/regs.h', 'r') as f:
                        outputs['c'] = f.read()
                    print(f"[Python] ✓ C header generated ({len(outputs['c'])} chars)")
                except Exception as e:
                    print(f"[Python] C header generation error: {e}")
                    traceback.print_exc()
                    outputs['c'] = f"Error generating C header: {e}"
            
            # Markdown documentation
            if options.get('docs', True):
                try:
                    print("[Python] Generating Markdown documentation...")
                    gen = generators.Markdown(rmap, path='doc/regs.md', title='Register Map', 
                                             print_images=True, image_dir='md_img', print_conventions=True)
                    gen.generate()
                    with open('doc/regs.md', 'r') as f:
                        outputs['docs'] = f.read()
                    print(f"[Python] ✓ Markdown doc generated ({len(outputs['docs'])} chars)")
                except Exception as e:
                    print(f"[Python] Markdown generation error: {e}")
                    traceback.print_exc()
                    outputs['docs'] = f"Error generating Markdown: {e}"
            
            # AsciiDoc documentation
            if options.get('docs', True):
                try:
                    print("[Python] Generating AsciiDoc documentation...")
                    gen = generators.Asciidoc(rmap, path='doc/regs.adoc', title='Register Map',
                                             print_images=True, image_dir='adoc_img', print_conventions=True)
                    gen.generate()
                    print("[Python] ✓ AsciiDoc doc generated")
                except Exception as e:
                    print(f"[Python] AsciiDoc generation error: {e}")
                    traceback.print_exc()
            
            # Collect all generated files
            files = {}
            for root, _, filenames in os.walk('.'):
                for fname in filenames:
                    fpath = os.path.join(root, fname)
                    # Skip the input regs.json
                    if fpath == './regs.json':
                        continue
                    rel = os.path.relpath(fpath, '.')
                    try:
                        with open(fpath, 'rb') as fh:
                            data = fh.read()
                        b64 = base64.b64encode(data).decode('ascii')
                        files[rel] = b64
                        print(f"[Python] Collected file: {rel} ({len(data)} bytes)")
                    except Exception as e:
                        print(f"[Python] Warning: could not read generated file {fpath}: {e}", file=sys.stderr)
            
            outputs['files'] = files
            print(f"[Python] Generation complete: vhdl={bool(outputs.get('vhdl'))}, c={bool(outputs.get('c'))}, docs={bool(outputs.get('docs'))}, total_files={len(files)}")
            
            return json.dumps({
                'success': True,
                'outputs': outputs
            })
        finally:
            os.chdir(old_cwd)

    except Exception as e:
        tb = traceback.format_exc()
        print(f"Generation error: {e}\\n{tb}", file=sys.stderr)
        return json.dumps({
            'success': False,
            'error': str(e),
            'traceback': tb
        })


def validate_config(config_json):
    """Validate register map configuration"""
    try:
        config = json.loads(config_json)

        # Basic structure validation
        if not isinstance(config, dict):
            return json.dumps({
                'valid': False,
                'error': 'Configuration must be a JSON object'
            })

        # Check for required fields
        if 'registers' not in config:
            return json.dumps({
                'valid': False,
                'error': 'Configuration must contain a "registers" array'
            })

        if not isinstance(config['registers'], list):
            return json.dumps({
                'valid': False,
                'error': '"registers" must be an array'
            })

        # Validate each register
        for idx, reg in enumerate(config['registers']):
            if not isinstance(reg, dict):
                return json.dumps({
                    'valid': False,
                    'error': f'Register at index {idx} must be an object'
                })

            if 'name' not in reg:
                return json.dumps({
                    'valid': False,
                    'error': f'Register at index {idx} is missing "name" field'
                })

        return json.dumps({
            'valid': True,
            'message': f'Configuration is valid with {len(config["registers"])} register(s)'
        })

    except json.JSONDecodeError as e:
        return json.dumps({
            'valid': False,
            'error': f'Invalid JSON: {str(e)}'
        })
    except Exception as e:
        tb = traceback.format_exc()
        return json.dumps({
            'valid': False,
            'error': str(e),
            'traceback': tb
        })

print("Corsair wrapper loaded successfully")
`;
}

/**
 * Run Corsair generation with the provided configuration
 */
async function runCorsairGeneration(configJson, options, baseAddress = '0x00000000', readFiller = '0xdeadbeef') {
    if (!corsairReady) {
        throw new Error('Python environment is not ready yet. Please wait for initialization to complete.');
    }

    if (!pyodide) {
        throw new Error('Pyodide is not initialized');
    }

    try {
        console.log('[Corsair] Starting generation with options:', options, 'base:', baseAddress, 'filler:', readFiller);

        // Escape the JSON string properly for Python
        const escapedJson = configJson
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');

        // Pass options as a JSON string to avoid JavaScript booleans (true/false) leaking into Python
        const escapedOptions = JSON.stringify(options)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
        
        // Escape base_address and read_filler
        const escapedBaseAddress = String(baseAddress).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const escapedReadFiller = String(readFiller).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const pythonCode = `generate_outputs('''${escapedJson}''', '''${escapedOptions}''', '''${escapedBaseAddress}''', '''${escapedReadFiller}''')`;

        console.log('[Corsair] Running Python generation...');

        const result = await pyodide.runPythonAsync(pythonCode);
        console.debug('[Corsair] Raw Python result:', result);

        const parsed = JSON.parse(result);
        console.debug('[Corsair] Parsed generation result:', parsed);
        if (parsed && parsed.outputs && parsed.outputs.files) {
            console.log('[Corsair] Files returned by Python:', Object.keys(parsed.outputs.files));
        } else {
            console.log('[Corsair] No files returned by Python in outputs.files');
        }

        if (!parsed.success) {
            console.error('[Corsair] Generation failed:', parsed.error);
            if (parsed.traceback) {
                console.error('[Corsair] Python traceback:', parsed.traceback);
            }
        } else {
            console.log('[Corsair] Generation successful');
        }

        return parsed;

    } catch (error) {
        console.error('[Corsair] Execution error:', error);
        throw new Error(`Generation failed: ${error.message}`);
    }
}


/**
 * Validate a configuration before generation
 */
async function validateConfig(configJson) {
    if (!corsairReady) {
        throw new Error('Python environment is not ready yet');
    }
    
    if (!pyodide) {
        throw new Error('Pyodide is not initialized');
    }
    
    try {
        const escapedJson = configJson
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
        
        const pythonCode = `validate_config('''${escapedJson}''')`;
        const result = await pyodide.runPythonAsync(pythonCode);
        
        return JSON.parse(result);
        
    } catch (error) {
        console.error('[Corsair] Validation error:', error);
        return {
            valid: false,
            error: error.message
        };
    }
}

/**
 * Check if Pyodide is loaded and start initialization
 */
function checkPyodideAndInit() {
    if (typeof window.loadPyodide !== 'undefined') {
        console.log('[Pyodide] CDN script loaded successfully');
        initializePyodideEnvironment();
    } else {
        loadingAttempts++;
        
        if (loadingAttempts < MAX_LOADING_ATTEMPTS) {
            console.log(`[Pyodide] Waiting for CDN... (attempt ${loadingAttempts}/${MAX_LOADING_ATTEMPTS})`);
            setTimeout(checkPyodideAndInit, 300);
        } else {
            console.error('[Pyodide] Failed to load CDN after multiple attempts');
            
            const loadingEl = document.getElementById('loading-pyodide');
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <div style="text-align: center; padding: 48px;">
                        <span class="material-icons" style="font-size: 64px; color: #f44336;">cloud_off</span>
                        <h3>Failed to Load Python Runtime</h3>
                        <p>The Pyodide library could not be loaded from CDN.</p>
                        <p style="color: #666; margin-top: 8px;">This may be due to:</p>
                        <ul style="text-align: left; max-width: 400px; margin: 16px auto; color: #666;">
                            <li>Internet connection issues</li>
                            <li>CDN availability problems</li>
                            <li>Browser compatibility issues</li>
                            <li>Ad blockers or security extensions</li>
                        </ul>
                        <button class="mdc-button mdc-button--raised" onclick="location.reload()" style="margin-top: 16px;">
                            <span class="mdc-button__ripple"></span>
                            <span class="mdc-button__label">Retry</span>
                        </button>
                    </div>
                `;
            }
            
            if (typeof showSnackbar === 'function') {
                showSnackbar('Failed to load Python runtime. Please refresh the page.', true);
            }
        }
    }
}

/**
 * Initialize when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Pyodide] DOM loaded, starting initialization check...');
        setTimeout(checkPyodideAndInit, 200);
    });
} else {
    // DOM already loaded
    console.log('[Pyodide] DOM already loaded, starting initialization check...');
    setTimeout(checkPyodideAndInit, 200);
}

// Export for debugging
window.pyodideDebug = {
    getPyodide: () => pyodide,
    isReady: () => corsairReady,
    reinitialize: initializePyodideEnvironment
};

console.log('[Pyodide] Loader script initialized');
