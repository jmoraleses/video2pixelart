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

HF_MODEL = "ZhengPeng7/BiRefNet"
HF_TOKEN = "" # Add your token here
model = None
device = None
transform_image = None

def init_local_model():
    global model, device, transform_image
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
                # We apply it here after BG removal (Already done inside process_with_ai now)
                # But kept logic consistency. Actually process_with_ai calls it now.
                # So we don't need to call it again.
                # result_img = replace_white_contour_with_black(result_img) 
                # Wait, I moved it INSIDE process_with_ai in previous step.
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
    app.run(port=8000)

