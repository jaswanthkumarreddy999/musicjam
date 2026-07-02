#!/bin/bash

# Create placeholder icons for PWA
# In production, you'd want proper icon designs

# Create a simple SVG icon
cat > icon.svg << 'EOF'
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1db954;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1ed760;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="240" fill="url(#grad)" stroke="#191414" stroke-width="32"/>
  <text x="256" y="280" font-family="Arial, sans-serif" font-size="200" text-anchor="middle" fill="#191414">🎵</text>
</svg>
EOF

# Note: In a real project, you'd use ImageMagick or similar to convert SVG to PNG
# For now, we'll create placeholder files
echo "Creating placeholder icon files..."

# Create empty PNG files (browsers will fallback gracefully)
touch icon-72.png
touch icon-96.png  
touch icon-128.png
touch icon-144.png
touch icon-152.png
touch icon-192.png
touch icon-384.png
touch icon-512.png
touch favicon.png

echo "Placeholder icons created. In production, convert the SVG to actual PNG files."