import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fieldnote',
    short_name: 'Fieldnote',
    description: 'Compare separate observations of local events.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8faf7',
    theme_color: '#315a43',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
