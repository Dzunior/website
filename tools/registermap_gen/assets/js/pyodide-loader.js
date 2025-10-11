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


def generate_outputs(regs_json_content, options, csrconfig_content=None, csrconfig_filename=None, regs_filename=None):
    """
    Generate register map outputs using corsair csrconfig + regs.json

    Args:
        regs_json_content: JSON string content of regs.json file
        options: Dict with output options (vhdl, c, docs, axil)

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

        # If a csrconfig file was provided by the browser, write it into the Pyodide FS without processing
        if csrconfig_content:
            try:
                fname = csrconfig_filename or 'csrconfig'
                # Ensure filename is safe (basic sanitation)
                fname = os.path.basename(fname)
                csr_path = os.path.join('/tmp', fname)
                with open(csr_path, 'w') as _cf:
                    _cf.write(csrconfig_content)
                print(f"[Python] Wrote csrconfig to {csr_path}")
            except Exception as _werr:
                print(f"[Python] Warning: could not write csrconfig: {_werr}", file=sys.stderr)

        # If regs.json raw content and a filename were provided, write it to the Pyodide FS so Corsair can read it by path
        regs_path = None
        if (regs_filename is not None) and (regs_json_content is not None):
            try:
                rname = os.path.basename(regs_filename) or 'regs.json'
                regs_path = os.path.join('/tmp', rname)
                with open(regs_path, 'w') as _rf:
                    _rf.write(regs_json_content)
                print(f"[Python] Wrote regs.json to {regs_path}")
            except Exception as _rerr:
                print(f"[Python] Warning: could not write regs.json to FS: {_rerr}", file=sys.stderr)

        # Create register map. If csrconfig is provided, avoid pre-loading regs.json and let Corsair read files by path.
        # Otherwise, fall back to creating regmap from provided regs.json
        if 'csr_path' in locals() and locals().get('csr_path'):
            print('[Python] CSR config provided; creating empty RegisterMap and delegating file reading to corsair')
            regmap = RegisterMap()
        else:
            # Prefer file-based loading (if available); otherwise parse the JSON content
            if regs_path:
                regmap = create_regmap_from_regs_file(regs_path)
            else:
                # Ensure we have valid JSON content before attempting to parse
                if not regs_json_content or not regs_json_content.strip():
                    print("[Python] Warning: Empty regs_json_content, creating empty RegisterMap")
                    regmap = RegisterMap()
                else:
                    regmap = create_regmap_from_regs_json(regs_json_content)

        # Prepare a dedicated output directory in the Pyodide FS so we can capture any files written
        import tempfile, shutil, base64
        outdir = os.path.join('/tmp', 'corsair_out')
        # Clean existing outdir
        try:
            if os.path.exists(outdir):
                shutil.rmtree(outdir)
        except Exception:
            pass
        os.makedirs(outdir, exist_ok=True)

        # Change current working directory to outdir so generators that write relative files place them there
        old_cwd = os.getcwd()
        try:
            # First, try using regmap.generate with csrconfig path if available (preferred: pass file paths to Corsair)
            used_regmap_generate = False
            try:
                csr_path_local = locals().get('csr_path', None)
            except Exception:
                csr_path_local = None
            if csr_path_local and hasattr(regmap, 'generate'):
                import inspect
                print(f"[Python] Attempting regmap.generate with csrconfig path: {csr_path_local}")
                try:
                    sig = None
                    try:
                        sig = inspect.signature(regmap.generate)
                        print(f"[Python] regmap.generate signature: {sig}")
                    except Exception as _sigerr:
                        print(f"[Python] Could not inspect regmap.generate signature: {_sigerr}")
                    # Try common calling patterns
                    # Temporarily change directory to the csrconfig location in case relative includes are used
                    csr_dir = os.path.dirname(csr_path_local) or '/tmp'
                    _pre_cwd = os.getcwd()
                    try:
                        os.chdir(csr_dir)
                    except Exception as _cd_e:
                        print(f"[Python] Warning: could not chdir to csr_dir {csr_dir}: {_cd_e}")
                    generate_attempts = [
                        lambda: regmap.generate(csr_path_local, outdir),
                        lambda: regmap.generate(csr_path_local),
                        lambda: regmap.generate(config=csr_path_local, outdir=outdir),
                        lambda: regmap.generate(config=csr_path_local),
                        lambda: regmap.generate(outdir=outdir)
                    ]
                    for i, attempt in enumerate(generate_attempts):
                        try:
                            attempt()
                            print(f"[Python] regmap.generate attempt {i+1} completed")
                            used_regmap_generate = True
                            break
                        except TypeError as te:
                            print(f"[Python] regmap.generate attempt {i+1} TypeError: {te}")
                            continue
                        except Exception as ge:
                            print(f"[Python] regmap.generate attempt {i+1} error: {ge}")
                            continue
                    # After generation attempts, ensure we switch to outdir for reading results and any manual fallbacks
                    try:
                        os.chdir(outdir)
                        print(f"[Python] Changed cwd to outdir: {outdir}")
                    except Exception as _cd2_e:
                        print(f"[Python] Warning: could not chdir to outdir {outdir}: {_cd2_e}")
                    # If outdir is empty, attempt to copy expected outputs from csr_dir (some versions ignore outdir arg)
                    try:
                        import shutil as _shutil
                        def _dir_not_empty(p):
                            try:
                                return any(os.scandir(p))
                            except Exception:
                                return False
                        if used_regmap_generate and (not _dir_not_empty(outdir)):
                            csr_dir = os.path.dirname(csr_path_local) or '/tmp'
                            for sub in ['hw', 'sw', 'doc']:
                                src = os.path.join(csr_dir, sub)
                                dst = os.path.join(outdir, sub)
                                if os.path.isdir(src):
                                    try:
                                        os.makedirs(dst, exist_ok=True)
                                        # Copy all files from src to dst
                                        for root, _, files in os.walk(src):
                                            relroot = os.path.relpath(root, src)
                                            for fn in files:
                                                s = os.path.join(root, fn)
                                                d = os.path.join(dst, relroot, fn)
                                                os.makedirs(os.path.dirname(d), exist_ok=True)
                                                _shutil.copyfile(s, d)
                                        print(f"[Python] Copied outputs from {src} to {dst}")
                                    except Exception as _cpy_e:
                                        print(f"[Python] Warning: copy from {src} failed: {_cpy_e}")
                    except Exception as _post_e:
                        print(f"[Python] Post-generate copy step failed: {_post_e}")
                except Exception as e_gen:
                    print(f"[Python] regmap.generate invocation failed: {e_gen}")

            # If regmap.generate wasn't used/successful, manually call generators
            if not used_regmap_generate:
                # Ensure we are in outdir so relative outputs land there
                try:
                    os.chdir(outdir)
                except Exception:
                    pass
                print("[Python] Running manual generators...")
            
            # Import generators module and attempt to discover generator classes dynamically
            import corsair.generators as genmod
            print(f"[Python] Available generators: {dir(genmod)}")

            def find_generator_class(keyword):
                """Find a generator class in genmod whose name contains keyword (case-insensitive)
                and which is a subclass of genmod.Generator if possible."""
                candidates = []
                for name in dir(genmod):
                    if keyword.lower() in name.lower():
                        obj = getattr(genmod, name)
                        if isinstance(obj, type):
                            candidates.append((name, obj))
                # Prefer classes that subclass genmod.Generator
                try:
                    base = getattr(genmod, 'Generator', None)
                except Exception:
                    base = None
                if base:
                    for name, cls in candidates:
                        try:
                            if issubclass(cls, base):
                                print(f"[Python] Selected generator class {name} for keyword '{keyword}' (subclass of Generator)")
                                return cls
                        except Exception:
                            continue
                if candidates:
                    print(f"[Python] Selected generator class {candidates[0][0]} for keyword '{keyword}' (fallback)")
                    return candidates[0][1]
                return None

            # Attempt to locate generators for VHDL, C, and Markdown using exact names first
            VHDL_cls = None
            for name in ['Vhdl', 'VHDL', 'VhdlGen']:
                if hasattr(genmod, name):
                    VHDL_cls = getattr(genmod, name)
                    print(f"[Python] Found VHDL generator: {name}")
                    break
            if not VHDL_cls:
                VHDL_cls = find_generator_class('vhdl')
            
            C_cls = None
            for name in ['CHeader', 'C', 'CGen']:
                if hasattr(genmod, name):
                    C_cls = getattr(genmod, name)
                    print(f"[Python] Found C generator: {name}")
                    break
            if not C_cls:
                C_cls = find_generator_class('c')
            
            Markdown_cls = None
            for name in ['Markdown', 'MarkdownGen', 'Md']:
                if hasattr(genmod, name):
                    Markdown_cls = getattr(genmod, name)
                    print(f"[Python] Found Markdown generator: {name}")
                    break
            if not Markdown_cls:
                Markdown_cls = find_generator_class('markdown') or find_generator_class('md') or find_generator_class('txt')

            outputs = {}

            def try_invoke_generator(cls, regmap, target_path):
                """Try multiple ways to invoke a generator class and ensure it writes to target_path."""
                if not cls:
                    return False
                try:
                    print(f"[Python] Trying to invoke generator {cls.__name__} for path: {target_path}")

                    # Prepare directories
                    try:
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    except Exception:
                        pass

                    inst = cls()
                    methods = [m for m in dir(inst) if not m.startswith('_')]
                    print(f"[Python] Generator {cls.__name__} methods: {methods}")

                    # Ensure common attribute name used by generators
                    try:
                        setattr(inst, 'rmap', regmap)
                    except Exception:
                        pass
                    try:
                        setattr(inst, 'regmap', regmap)
                    except Exception:
                        pass

                    # Prefer explicit render_to_file if available
                    if hasattr(inst, 'render_to_file'):
                        try:
                            # Try signature (regmap, target)
                            inst.render_to_file(regmap, target_path)
                            print(f"[Python] {cls.__name__}.render_to_file(regmap, path) succeeded")
                            return True
                        except TypeError:
                            try:
                                # Try signature (target) with rmap set on instance
                                inst.render_to_file(target_path)
                                print(f"[Python] {cls.__name__}.render_to_file(path) succeeded with rmap on instance")
                                return True
                            except Exception as e:
                                print(f"[Python] render_to_file attempts failed: {e}")

                    # Fallback to render() and write ourselves
                    if hasattr(inst, 'render'):
                        try:
                            try:
                                content = inst.render(regmap)
                            except TypeError:
                                content = inst.render()
                            if isinstance(content, (str, bytes)):
                                mode = 'wb' if isinstance(content, bytes) else 'w'
                                with open(target_path, mode) as outf:
                                    outf.write(content)
                                print(f"[Python] Wrote rendered content to {target_path}")
                                return True
                            else:
                                print(f"[Python] render() returned non-text type: {type(content)}")
                        except Exception as e:
                            print(f"[Python] render attempts failed: {e}")

                    # Try generic generate patterns as a last resort
                    generate_attempts = [
                        lambda: inst.generate(regmap, target_path),
                        lambda: inst.generate(regmap),
                        lambda: inst.generate(target_path),
                        lambda: inst.generate(),
                    ]
                    for i, attempt in enumerate(generate_attempts):
                        try:
                            attempt()
                            print(f"[Python] Generator {cls.__name__} generate() attempt {i+1} finished")
                            # If the generator wrote to its own default location, attempt to copy to our target
                            # Try known method 'make_target' or 'path'
                            try:
                                if hasattr(inst, 'make_target'):
                                    produced = inst.make_target()
                                    if produced and os.path.exists(produced):
                                        try:
                                            os.makedirs(os.path.dirname(target_path), exist_ok=True)
                                        except Exception:
                                            pass
                                        import shutil
                                        shutil.copyfile(produced, target_path)
                                        print(f"[Python] Copied generated file from {produced} to {target_path}")
                                        return True
                            except Exception as e_mt:
                                print(f"[Python] make_target check failed: {e_mt}")
                            # Otherwise, hope it rendered to our outdir and will be picked up
                            return True
                        except TypeError as te:
                            print(f"[Python] generate attempt {i+1} failed with TypeError: {te}")
                            continue
                        except Exception as e:
                            print(f"[Python] generate attempt {i+1} raised: {e}")
                            continue

                    print(f"[Python] All attempts failed for generator {cls.__name__}")
                    return False
                except Exception as e_inst:
                    print(f"[Python] Could not instantiate generator {cls.__name__}: {e_inst}")
                    return False

            # Run generators based on requested options
            if options.get('vhdl', True) and VHDL_cls:
                try:
                    ok = try_invoke_generator(VHDL_cls, regmap, 'hw/regs.vhd')
                    if ok:
                        print("[Python] VHDL generation attempt finished (success) ")
                    else:
                        print("[Python] VHDL generation attempt finished (no suitable invocation)")
                except Exception as e:
                    print(f"[Python] VHDL generation failed: {e}", file=sys.stderr)

            if options.get('c', True) and C_cls:
                try:
                    ok = try_invoke_generator(C_cls, regmap, 'sw/regs.h')
                    if ok:
                        print("[Python] C generation attempt finished (success)")
                    else:
                        print("[Python] C generation attempt finished (no suitable invocation)")
                except Exception as e:
                    print(f"[Python] C header generation failed: {e}", file=sys.stderr)

            if options.get('docs', True) and Markdown_cls:
                try:
                    ok = try_invoke_generator(Markdown_cls, regmap, 'doc/regs.md')
                    if ok:
                        print("[Python] Documentation generation attempt finished (success)")
                    else:
                        print("[Python] Documentation generation attempt finished (no suitable invocation)")
                except Exception as e:
                    print(f"[Python] Documentation generation failed: {e}", file=sys.stderr)

            # Ensure cwd is outdir before reading files
            try:
                os.chdir(outdir)
            except Exception:
                pass
            print("[Python] Generation phase complete, checking for output files...")

            # Read generated files from the configured paths
            output_files = {
                'vhdl': ['hw/regs.vhd', 'regs.vhd'],  # generated path, fallback
                'c': ['sw/regs.h', 'regs.h'],
                'docs': ['doc/regs.md', 'regs.md']
            }

            for output_type, file_paths in output_files.items():
                if not options.get(output_type, True):
                    print(f"[Python] Skipping {output_type} (disabled in options)")
                    continue
                    
                content = None
                for file_path in file_paths:
                    try:
                        with open(file_path, 'r') as f:
                            content = f.read()
                            print(f"[Python] Read {output_type} from {file_path} ({len(content)} chars)")
                            break
                    except FileNotFoundError:
                        print(f"[Python] File not found: {file_path}")
                        continue
                    except Exception as e:
                        print(f"[Python] Error reading {file_path}: {e}")
                        continue
                
                if content and content.strip():
                    outputs[output_type] = content
                else:
                    outputs[output_type] = f"No {output_type} output generated."
                    print(f"[Python] Warning: No content for {output_type}")

        finally:
            try:
                os.chdir(old_cwd)
            except Exception:
                pass

        # Collect any files generated in the output directory and include them in the response
        files = {}
        for root, _, filenames in os.walk(outdir):
            for fname in filenames:
                fpath = os.path.join(root, fname)
                rel = os.path.relpath(fpath, outdir)
                try:
                    with open(fpath, 'rb') as fh:
                        data = fh.read()
                    b64 = base64.b64encode(data).decode('ascii')
                    files[rel] = b64
                    print(f"[Python] Collected file: {rel} ({len(data)} bytes)")
                except Exception as e:
                    print(f"[Python] Warning: could not read generated file {fpath}: {e}", file=sys.stderr)

        outputs['files'] = files
        print(f"[Python] Final outputs: vhdl={bool(outputs.get('vhdl'))}, c={bool(outputs.get('c'))}, docs={bool(outputs.get('docs'))}, files={len(files)}")

        return json.dumps({
            'success': True,
            'outputs': outputs
        })

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
async function runCorsairGeneration(configJson, options, csrconfigContent = null, csrconfigFilename = null, regsFilename = null) {
    if (!corsairReady) {
        throw new Error('Python environment is not ready yet. Please wait for initialization to complete.');
    }

    if (!pyodide) {
        throw new Error('Pyodide is not initialized');
    }

    try {
        console.log('[Corsair] Starting generation with options:', options);

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

        // Prepare csrconfig content and filename (if present)
        let escapedCsr = null;
        let escapedCsrName = null;
        if (csrconfigContent !== null && typeof csrconfigContent !== 'undefined') {
            escapedCsr = String(csrconfigContent)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            escapedCsrName = String(csrconfigFilename || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        // Escape regs filename if provided
        let escapedRegsName = null;
        if (regsFilename) {
            escapedRegsName = String(regsFilename).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        let pythonCode;
        if (escapedCsr !== null) {
            // pass regs filename as the 5th argument if available
            if (escapedRegsName) {
                pythonCode = `generate_outputs('''${escapedJson}''', '''${escapedOptions}''', '''${escapedCsr}''', '''${escapedCsrName}''', '''${escapedRegsName}''')`;
            } else {
                pythonCode = `generate_outputs('''${escapedJson}''', '''${escapedOptions}''', '''${escapedCsr}''', '''${escapedCsrName}''')`;
            }
        } else {
            if (escapedRegsName) {
                pythonCode = `generate_outputs('''${escapedJson}''', '''${escapedOptions}''', None, None, '''${escapedRegsName}''')`;
            } else {
                pythonCode = `generate_outputs('''${escapedJson}''', '''${escapedOptions}''')`;
            }
        }

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
