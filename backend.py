import os
import io
import traceback
from flask import Flask, request, send_from_directory, jsonify, send_file
from PIL import Image

app = Flask(__name__, static_folder='.')

# ===== Local AI Model (RMBG-2.0) =====
import torch
import numpy as np # Added for pixel manipulation
from transformers import AutoModelForImageSegmentation
from torchvision import transforms
import warnings
warnings.filterwarnings("ignore", category=UserWarning) # Broad ignore for demo
from transformers import logging as hf_logging
hf_logging.set_verbosity_error()

HF_MODEL = "ZhengPeng7/BiRefNet"
HF_TOKEN = "" # Add your token here
model = None
device = None
transform_image = None

# ===== Upscaler Model (Swin2SR) =====
# ===== Upscaler Model (Swin2SR) =====
UPSCALER_MODEL_ID = "caidas/swin2SR-lightweight-x2-64"
upscaler_model = None
upscaler_processor = None

def clear_gpu_memory():
    """Aggressively clear memory"""
    import gc
    gc.collect()
    if device:
        if device.type == 'mps':
            torch.mps.empty_cache()
        elif device.type == 'cuda':
            torch.cuda.empty_cache()

def unload_local_model():
    global model, transform_image
    if model is not None:
        print("🗑️ Unloading BiRefNet to free memory...")
        del model
        model = None
        transform_image = None
        clear_gpu_memory()

def unload_upscaler_model():
    global upscaler_model, upscaler_processor
    if upscaler_model is not None:
        print("🗑️ Unloading Upscaler to free memory...")
        del upscaler_model
        del upscaler_processor
        upscaler_model = None
        upscaler_processor = None
        clear_gpu_memory()



def init_local_model():
    global model, device, transform_image
    
    # Check if we need to unload upscaler
    if upscaler_model is not None:
        unload_upscaler_model()
        
    if model is not None:
        return True

    print("🖥️ Loading Local Model (BiRefNet)... this may take a moment on first run.")
    try:
        # Detect device: MPS for Mac, CUDA for Nvidia, CPU fallback
        if torch.backends.mps.is_available():
            device = torch.device("mps")
            print("🚀 Using Apple Silicon (MPS) acceleration")
        elif torch.cuda.is_available():
            device = torch.device("cuda")
            print("🚀 Using GPU (CUDA) acceleration")
        else:
            device = torch.device("cpu")
            print("⚠️ Using CPU (Slower but works)")

        model = AutoModelForImageSegmentation.from_pretrained(
            HF_MODEL, 
            trust_remote_code=True,
            token=HF_TOKEN,
            cache_dir="model_birefnet"
        )
        model.to(device)
        model.eval()
        
        # Preprocessing setup (No fixed resize to allow proportional input)
        transform_image = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        print("✅ Local Model loaded successfully!")
        return True
    except Exception as e:
        print(f"❌ Failed to load local model: {e}")
        return False

def replace_white_contour_with_black(pil_image, edge_radius=2):
    """
    More aggressive approach: Detects the contour of the alpha channel and forces it to black.
    This covers any light/white fringing (halos) resulting from background removal.
    """
    print("🎨 Applying Black Contour Correction...")
    if pil_image.mode != "RGBA":
        pil_image = pil_image.convert("RGBA")
        
    # Convert to PyTorch Tensor [C, H, W] 0-1 range
    img_tensor = transforms.ToTensor()(pil_image).unsqueeze(0).to(device) # [1, 4, H, W]
    
    # Extract Alpha and RGB
    alpha = img_tensor[:, 3:4, :, :] # [1, 1, H, W]
    rgb = img_tensor[:, 0:3, :, :]   # [1, 3, H, W]
    
    # --- 1. Clean Alpha: Remove semi-transparent fringe (Hard Threshold) ---
    # Many BG removal tools leave faint semi-transparent pixels.
    # We threshold alpha to make it clear cut, removing very faint noise.
    # 0.5 is a standard threshold.
    binarized_alpha = (alpha > 0.5).float()
    
    # --- 2. Detect Edge (Morphological Gradient on Alpha) ---
    import torch.nn.functional as F
    
    # Dilate the object (Max Pool) -> Expands white area
    k_size = 2 * edge_radius + 1
    # Check checks available devices for faster processing if available
    proc_device = device if device else torch.device("cpu")
    
    # Move to device for processing
    binarized_alpha = binarized_alpha.to(proc_device)
    
    # Erode the object (Negative Max Pool) -> Shrinks white area
    # -(-A) max_pool = A min_pool = A erosion
    try:
         eroded_alpha = -F.max_pool2d(-binarized_alpha, kernel_size=k_size, stride=1, padding=edge_radius)
    except:
         # CPU fallback if needed
         eroded_alpha = -F.max_pool2d(-binarized_alpha.cpu(), kernel_size=k_size, stride=1, padding=edge_radius)
         binarized_alpha = binarized_alpha.cpu()
    
    # The "External" Edge is (Dilated - Original) => Outline outside the object (Stroke)
    # The "Internal" Edge is (Original - Eroded) => Outline inside the object (Inner Border)
    # To cover a halo, we usually want to turn the OUTER pixels of the object into black.
    
    # We define the "Edge" as the difference between the full object and a slightly eroded version.
    # This selects the outermost N pixels of the object itself.
    contour_mask = binarized_alpha - eroded_alpha
    
    # Ensure masks are on the same device as chunks
    contour_mask = contour_mask.to(rgb.device)
    binarized_alpha = binarized_alpha.to(rgb.device)
    
    # --- 3. Apply Black to Contour ---
    # Where contour_mask is 1, set RGB to 0 (Black) and keep Alpha 1 (Opaque)
    # We want a solid black line.
    
    # Update RGB: If contour, be Black (0). Else, keep original.
    # Note: contour_mask is 1.0 at edges.
    new_rgb = rgb * (1 - contour_mask) + torch.zeros_like(rgb) * contour_mask
    
    # Update Alpha: Ensure the contour is fully opaque (fix semi-transparent edges)
    # We use the binarized alpha for the final image to have crisp edges.
    new_alpha = binarized_alpha 
    
    # Combine back
    new_img_tensor = torch.cat([new_rgb, new_alpha], dim=1)
    
    # Convert back to PIL
    result_img = transforms.ToPILImage()(new_img_tensor.squeeze(0).cpu())
    
    return result_img

def process_with_ai(image: Image.Image, threshold: float = 0.5) -> Image.Image:
    """Process image using LOCAL BiRefNet model"""
    print(f"🛠️ Entering process_with_ai (Local) - Threshold: {threshold}")
    
    if model is None:
        if not init_local_model():
            raise RuntimeError("Local model is not loaded")


    # Enforce Height = 1024, Width = Proportional (Multiple of 32 for Tensor compatibility)
    target_height = 1024
    ratio = target_height / image.height
    new_width = int(image.width * ratio)
    new_width = (new_width // 32) * 32 # Snap to grid of 32
    if new_width < 32: new_width = 32
    
    image = image.resize((new_width, target_height), Image.Resampling.LANCZOS)
    print(f"⬇️ Resized input to {image.size} (Height 1024) for Model")

    # Keep original size for later
    original_size = image.size
    
    # Convert to RGB if needed
    if image.mode != "RGB":
        input_img = image.convert("RGB")
    else:
        input_img = image
    
    try:
        print(f"⚡ Processing frame locally on {device}...")
        
        # Preprocess
        input_tensor = transform_image(input_img).unsqueeze(0).to(device)
        
        # Inference
        with torch.no_grad():
            output = model(input_tensor)
            # Handle different model output types (List, Tuple, or Tensor)
            if isinstance(output, (list, tuple)):
                print(f"📦 Model output is list/tuple of length {len(output)}")
                preds = output[0] # BiRefNet typically has main prediction at index 0 (unlike RMBG at -1)
            else:
                print(f"📦 Model output is Tensor {output.shape}")
                preds = output
                
            preds = preds.sigmoid().cpu()
            print(f"📊 Preds stats - Min: {preds.min():.4f}, Max: {preds.max():.4f}, Mean: {preds.mean():.4f}")
                
        # Post-process mask
        pred = preds[0].squeeze()
        
        # Apply Threshold to Mask (User Control)
        mask_tensor = (pred > threshold).float()
        
        pred_pil = transforms.ToPILImage()(mask_tensor)
        mask = pred_pil.resize(original_size)
        
        # Apply mask
        result_img = image.copy()
        result_img.putalpha(mask)
        
        # --- POST-PROCESSING: White to Black Contour ---
        result_img = replace_white_contour_with_black(result_img)
        # -----------------------------------------------
        del input_tensor, preds, pred, pred_pil, mask
        import gc
        gc.collect()
        if device.type == 'mps':
            torch.mps.empty_cache()
        elif device.type == 'cuda':
            torch.cuda.empty_cache()
            
        print(f"✅ Local inference complete")
        return result_img

    except Exception as e:
        print(f"❌ Local inference error: {e}")
        raise e

def init_upscaler_model():
    global upscaler_model, upscaler_processor, device
    
    # Check if we need to unload local model (BiRefNet)
    if model is not None:
        unload_local_model()
        
    if upscaler_model is not None:
        return True

        
    print(f"🖥️ Loading Upscaler Model ({UPSCALER_MODEL_ID})...")
    try:
        from transformers import Swin2SRForImageSuperResolution, Swin2SRImageProcessor
        
        # Ensure device is set (it should be from init_local_model, but just in case)
        if device is None:
             if torch.backends.mps.is_available():
                device = torch.device("mps")
             elif torch.cuda.is_available():
                device = torch.device("cuda")
             else:
                device = torch.device("cpu")
                
        upscaler_processor = Swin2SRImageProcessor.from_pretrained(UPSCALER_MODEL_ID, cache_dir="model_upscaler")
        upscaler_model = Swin2SRForImageSuperResolution.from_pretrained(UPSCALER_MODEL_ID, cache_dir="model_upscaler")
        upscaler_model.to(device)
        upscaler_model.eval()
        
        print("✅ Upscaler Model loaded successfully!")
        return True
    except Exception as e:
        print(f"❌ Failed to load upscaler model: {e}")
        traceback.print_exc()
        return False

def tile_process(image, tile_size=128, overlap=16):
    """
    Process image in tiles to save memory.
    tile_size: Input tile size. 128 is safe for 8GB RAM on Swin2SR x4.
    overlap: Input overlap
    """
    width, height = image.size
    
    # Use the device where the model is currently located
    device = upscaler_model.device
    print(f"⚙️ Tile Processor running on: {device}")
    
    # Scale factor for scaling model
    scale = 2
    
    # New full size
    new_width = width * scale
    new_height = height * scale
    new_image = Image.new("RGB", (new_width, new_height))
    
    # Ultra-Low RAM Settings
    stride = tile_size - (overlap * 2)
    pad = overlap
    
    print(f"🧩 Processing with tiles: {tile_size}x{tile_size} (Stride: {stride})")

    # Determine how many tiles we need in each dimension
    import math
    cols = math.ceil(width / stride)
    rows = math.ceil(height / stride)
    
    # The padded image must be large enough to hold the last tile
    # Last tile starts at: (cols-1)*stride
    # Last tile ends at: (cols-1)*stride + tile_size
    # Since tile_size = stride + 2*pad, end is (cols)*stride + 2*pad?
    # Actually: max_x = (cols-1)*stride. We need max_x + tile_size to be valid.
    
    req_width = (cols - 1) * stride + tile_size
    req_height = (rows - 1) * stride + tile_size
    
    # Create padded image with reflection or constant
    # We use a large canvas
    img_padded = Image.new("RGB", (req_width, req_height))
    
    # Paste original at (pad, pad) to handle the first overlap correctly
    # But wait, our logic implies x=0 corresponds to "original 0" in the CORE
    # x iterates 0, stride, 2*stride...
    # The crop is x to x+tile_size.
    # The CORE of that crop is x+pad to x+pad+stride.
    # We want that CORE to map to the original image from x to x+stride.
    # So if we paste the original image at (pad, pad), then:
    # Crop at 0 (x=0) gives 0..128. Core is 16..112 (size 96).
    # Since original is at 16, this matches original 0..96. Correct.
    
    img_padded.paste(image, (pad, pad))
    
    # We might need to fill the rest (right/bottom) with something to avoid black borders influencing model
    # Replicate edge pixels approx? For now black is safer than noise, 
    # but strictly speaking reflection is better. 
    # Let's simple paste and rely on black padding for far edges which are discarded anyway 
    # EXCEPT for the edges of the image where we actually want content.
    # Since we paste at (pad, pad), the right edge of image is at pad+width.
    # If req_width > pad+width, we have empty space.
    # This empty space acts as padding for the last tile logic.
    
    
    total_tiles = rows * cols
    processed_count = 0
    print(f"🧩 Total tiles to process: {total_tiles}")
    
    for row in range(rows):
        for col in range(cols):
            processed_count += 1
            if processed_count % 10 == 0 or processed_count == total_tiles:
                print(f"   ... Tile {processed_count}/{total_tiles} ({(processed_count/total_tiles)*100:.0f}%)", end='\r')

            y = row * stride
            x = col * stride
            
            # Crop input tile (always full size now)
            tile = img_padded.crop((x, y, x + tile_size, y + tile_size))
            
            # Verify tile size
            if tile.size != (tile_size, tile_size):
                print(f"⚠️ Warning: Tile size mismatch {tile.size}, expected {tile_size}x{tile_size}. Padding...")
                # Should not happen with new logic, but safety first
                temp = Image.new("RGB", (tile_size, tile_size))
                temp.paste(tile, (0,0))
                tile = temp
            
            # Upscale Tile
            # do_resize=False is crucial if processor defaults to resizing
            inputs = upscaler_processor(tile, return_tensors="pt").to(device)
            # Note: Swin2SR processor might do rescaling (1/255). 
            # If we pass do_rescale=False we must ensure tensor is correct.
            # Usually processor handles it. Let's trust processor but check size.
            # Actually safely:
            # inputs = upscaler_processor(tile, return_tensors="pt").to(device) 
            # If tile is correct size, resize shouldn't occur or shouldn't matter if 1:1.
            
            with torch.no_grad():
                out_tensor = upscaler_model(**inputs).reconstruction.data
            
            # Post-process tile
            out_tensor = out_tensor.squeeze().float().cpu().clamp_(0, 1).numpy()
            out_tensor = np.moveaxis(out_tensor, 0, -1)
            out_tile = (out_tensor * 255.0).round().astype(np.uint8)
            out_pil = Image.fromarray(out_tile)
            
            # Output Tile is 4x larger
            out_pad = pad * scale
            out_stride = stride * scale
            
            # Crop valid center
            # valid_box = (out_pad, out_pad, out_pad + out_stride, out_pad + out_stride)
            # valid_patch = out_pil.crop(valid_box)
            
            # However, for edges, we might want to keep more info?
            # The simple logic: discard overlaps always.
            # This is fine because we padded the input image with 'pad' on all sides (top/left implicit, bottom/right implicit)
            # So the "valid" center always corresponds to the real image content we iterated over.
            
            valid_box = (out_pad, out_pad, out_pad + out_stride, out_pad + out_stride)
            valid_patch = out_pil.crop(valid_box)
            
            # Paste into result
            target_x = x * scale
            target_y = y * scale
            
            # Handle edge cases where target exceeds new_image size
            # (Because last tile might extend beyond)
            # We intersect with image bounds
            
            w_patch, h_patch = valid_patch.size
            
            # We simply paste. The image object clips automatically?
            # PIL 'paste' does not error on out of bounds, it clips.
            # But we must ensure 'paste_box' and 'valid_patch' align?
            # target_x, target_y are where we put the TOP-LEFT of the patch.
            # This corresponds to 'x' in original.
            # checking: x=0 -> target=0. Correct.
            
            new_image.paste(valid_patch, (target_x, target_y))
            
            del inputs, out_tensor, out_pil, valid_patch
            if device.type == 'mps': torch.mps.empty_cache()
            import gc
            gc.collect()

    return new_image

def process_upscale(image: Image.Image, target_height: int = 1152, use_ai: bool = True) -> Image.Image:
    """Upscale image 4x using Swin2SR, then resize to target_height. Option to skip AI."""
    print(f"🛠️ Entering process_upscale (Target Height: {target_height}, Use AI: {use_ai})")
    
    # 1. Resize Only Mode
    if not use_ai:
        print(f"📉 Resizing ONLY to height {target_height} (No AI)...")
        ratio = target_height / image.height
        target_w = int(image.width * ratio)
        # Use simple resizing (LANCZOS for quality)
        return image.resize((target_w, target_height), Image.Resampling.LANCZOS)

    # 2. AI Upscaling Mode
    if upscaler_model is None:
        if not init_upscaler_model():
            raise RuntimeError("Upscaler model failed to load")
            
    try:
        if image.mode != "RGB":
            input_img = image.convert("RGB")
        else:
            input_img = image
            
        # Use smaller tiles (64) to prevent locking up the system on 8GB RAM
        # 128x128 -> 4x -> 512x512 tile output requires significant VRAM/RAM buffer
        # 64x64 -> 4x -> 256x256 is much lighter
        
        try:
            # Lightweight model (x2). 
            # Using 256x256 tiles: Optimal balance for 8GB RAM (Speed vs Stability).
            # 1280x720 -> ~15 tiles. Very fast and safe.
            result_x2 = tile_process(input_img, tile_size=256, overlap=32)
            
            # Post-process: Resize to fixed height (User Request)
            ratio = target_height / result_x2.height
            target_w = int(result_x2.width * ratio)
            
            print(f"📉 Resizing output to height {target_height} (Width {target_w})...")
            final_result = result_x2.resize((target_w, target_height), Image.Resampling.LANCZOS)
            
            return final_result

        except Exception as e:
            msg = str(e).lower()
            # Catch MPS errors (signal aborted) or OOM
            if "aborted" in msg or "memory" in msg or "fail" in msg:
                print(f"⚠️ GPU Error detected: {e}")
                print("🔄 Falling back to CPU for stability (This will be slower but safe)...")
                
                # Move model to CPU
                upscaler_model.to("cpu")
                
                # Clear GPU memory
                clear_gpu_memory()
                
                # Retry on CPU
                result = tile_process(input_img, tile_size=128, overlap=16)

                # Resize result from fallback
                ratio = target_height / result.height
                target_w = int(result.width * ratio)
                final_result = result.resize((target_w, target_height), Image.Resampling.LANCZOS)
                return final_result
            else:
                raise e
        
    except Exception as e:
        print(f"❌ Upscale error: {e}")
        # Try to clear memory again
        clear_gpu_memory()
        raise e


# ===== Initialization =====
USE_AI = init_local_model()
import threading
inference_lock = threading.Lock()

# ===== Routes =====
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    # print("📩 Received /remove-bg request") # Reduce spam
    
    if 'image' not in request.files:
        return jsonify({'error': 'No image file in request'}), 400
    
    file = request.files['image']
    
    # Get threshold from form data (default 475 -> 0.95)
    try:
        threshold_val = float(request.form.get('threshold', 475))
        # Map 0-500 to 0-1
        threshold = threshold_val / 500.0
    except:
        threshold = 0.5

    try:
        img = Image.open(file.stream)
        
        if USE_AI:
            # Serialize inference to prevent OOM
            with inference_lock:
                result_img = process_with_ai(img, threshold=threshold)
                
                # --- POST-PROCESSING: White to Black Contour ---
                pass
                # -----------------------------------------------
        else:
            return jsonify({'error': 'AI Model not loaded'}), 503
        
        output_buffer = io.BytesIO()
        result_img.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        
        return send_file(output_buffer, mimetype='image/png')

    except Exception as e:
        print(f"Error processing: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/upscale', methods=['POST'])
def upscale_image():
    # print("📩 Received /upscale request")
    
    if 'image' not in request.files:
        return jsonify({'error': 'No image file in request'}), 400
        
    file = request.files['image']
    target_height = int(request.form.get('target_height', 1152))
    use_ai = request.form.get('use_ai', 'true') == 'true'

    try:
        img = Image.open(file.stream)
        
        # Serialize inference
        with inference_lock:
            result_img = process_upscale(img, target_height=target_height, use_ai=use_ai)
            
        output_buffer = io.BytesIO()
        result_img.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        
        return send_file(output_buffer, mimetype='image/png')
        
    except Exception as e:
        print(f"Error upscaling: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/health')
def health():
    status = {
        "status": "ok",
        "mode": "local_inference",
        "device": str(device) if device else "unknown",
        "model_loaded": model is not None
    }
    return jsonify(status)

if __name__ == '__main__':
    print("🚀 Server starting (Local Mode + Black Contour Fix)...")
    try:
        app.run(port=8000)
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user. Cleaning up memory...")
        unload_local_model()
        unload_upscaler_model()
        clear_gpu_memory()
        print("✅ Cleanup finished. Bye!")

