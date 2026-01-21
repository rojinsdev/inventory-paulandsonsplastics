# Assets Directory

Place your static assets here:

- `logo.png` or `logo.svg` - Company logo
- `favicon.ico` - Browser tab icon
- Other images and icons

## Usage in Next.js

Files in this folder are accessible at `/assets/filename`:

```jsx
<img src="/assets/logo.png" alt="Paul & Sons Plastics" />
```

Or with Next.js Image component:

```jsx
import Image from 'next/image';

<Image src="/assets/logo.png" alt="Logo" width={120} height={40} />
```
