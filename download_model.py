from ultralytics import SAM
import time

import os

print("⬇️ Starting SAM Model Download (sam2_b.pt) to model_sam2/...")
try:
    # Ensure directory exists
    os.makedirs("model_sam2", exist_ok=True)
    
    # Define path
    model_path = os.path.join("model_sam2", "sam2_b.pt")
    
    # Initialize model with specific path - Ultralytics allows this
    # If the file doesn't exist at path, it should try to download it there 
    # or we might need to download manually if SAM() doesn't support custom download location easily.
    # Actually SAM() with a path checks that path. If missing, it downloads to current dir usually.
    # Let's try downloading via the constructor if it supports it, otherwise we move it.
    
    # Workaround: Ultralytics usually looks in current dir. 
    # We will instantiate it. If it downloads to root, we move it.
    
    if os.path.exists(model_path):
        print(f"ℹ️ Model already exists at {model_path}")
        model = SAM(model_path)
    else:
        print("⏳ Model not found in folder. Initializing (may download to root first)...")
        # Try loading strictly from the path we want, if it fails/downloads elsewhere we handle it
        # Actually simplest is to just let it download and then move if needed, 
        # BUT `SAM("path/to/model.pt")` usually implies "load from here".
        
        # To force download to a specific place is tricky with just the constructor if logic is fixed.
        # Check if we can rename after.
        model = SAM("sam2_b.pt") # Downloads to root likely
        
        # Move to folder
        if os.path.exists("sam2_b.pt"):
            print("📦 Moving model to model_sam2/...")
            os.rename("sam2_b.pt", model_path)
            # Reload from new path
            model = SAM(model_path)
            
    print("✅ SAM Model is present and loaded successfully!")
    print(f"📍 Location: {model_path}")
except Exception as e:
    print(f"❌ Error downloading/loading model: {e}")
