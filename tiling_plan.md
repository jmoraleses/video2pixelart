
# Tiled Upscaling Implementation Plan

Since the user experienced an OOM with a ~3.4GB allocation, this likely corresponds to a large attention matrix or intermediate tensor in Swin2SR. Even with exclusive model loading, processing a full 1080p frame (or even 720p) with Swin2SR x4 on MPS might hit the 20GB limit quickly due to how MPS manages memory.

## Tiling Algorithm
1.  Define `tile_size` (e.g., 256 or 512) and `overlap` (e.g., 16).
2.  Split the input image into overlapping tiles.
3.  Process each tile independently.
4.  Stitch the tiles back together, discarding the overlap regions to avoid boundary artifacts.

I will implement a `process_upscale_tiled` helper function in `backend.py` and call it from `process_upscale`.
