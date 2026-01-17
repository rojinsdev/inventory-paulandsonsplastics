# Assets Folder

This folder contains static assets for the Paul & Sons Plastics mobile application.

## Images

Place your company logo and other image assets in the `images/` folder:

### Required:
- **logo.png** - Company logo (recommended size: 512x512px or 1024x1024px)

### Optional:
- **logo_white.png** - White variant of the logo for use on dark/colored backgrounds
- **logo_small.png** - Smaller version for app bars (recommended: 128x128px)

## Usage in Code

To use images from assets in your Flutter app:

```dart
Image.asset(
  'assets/images/logo.png',
  width: 120,
  height: 120,
)
```

## Notes

- Use PNG format for logos with transparency
- Use high-resolution images for better display on various devices
- Keep file sizes optimized for mobile performance
