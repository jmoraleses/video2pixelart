
try:
    from transformers import Swin2SRForImageSuperResolution, Swin2SRImageProcessor
    model_id = "caidas/swin2sr-realworld-sr-x4-64-bsrgan-psnr"
    print(f"Testing {model_id} with Swin2SRForImageSuperResolution")
    model = Swin2SRForImageSuperResolution.from_pretrained(model_id)
    processor = Swin2SRImageProcessor.from_pretrained(model_id)
    print("✅ Success!")
except Exception as e:
    print(f"❌ Error: {e}")
