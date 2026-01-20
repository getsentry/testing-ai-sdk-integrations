# Test Assets

This directory contains static test assets used across test cases.

## Files

### test-image-10x10-red.png

- **Size:** 10x10 pixels
- **Format:** PNG
- **Color:** Red (#FF0000)
- **Purpose:** Used in binary content redaction tests (test case 10) to verify that Sentry correctly redacts binary data in captured spans

This static image replaces the need for dynamically generating test images with Pillow, reducing dependencies and improving test reliability.

## Usage

Test cases can read this image using standard file operations:

**Python:**
```python
from pathlib import Path

# Get path to test image (from SDK test case)
repo_root = Path(__file__).parent.parent.parent.parent
image_path = repo_root / "shared" / "test-assets" / "test-image-10x10-red.png"

with open(image_path, "rb") as f:
    image_data = f.read()
```

**JavaScript:**
```javascript
const fs = require('fs');
const path = require('path');

// Get path to test image (from SDK test case)
const repoRoot = path.join(__dirname, '..', '..', '..', '..');
const imagePath = path.join(repoRoot, 'shared', 'test-assets', 'test-image-10x10-red.png');

const imageData = fs.readFileSync(imagePath);
```
