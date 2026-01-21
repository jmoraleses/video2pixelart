import os
from ultralytics import SAM
import sys

print("Current working directory:", os.getcwd())
model_path = os.path.join("model_sam2", "sam2_b.pt")
print("Target model path:", model_path)
print("Exists?", os.path.exists(model_path))

try:
    if os.path.exists(model_path):
        model = SAM(model_path)
        print("✅ SUCCESS: Model loaded")
    else:
        print("❌ FAIL: Model file missing")
except Exception as e:
    print(f"❌ FAIL: Loading error: {e}")
    import traceback
    traceback.print_exc()
