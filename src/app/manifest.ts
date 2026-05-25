import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aether Reader Flow',
    short_name: 'Aether',
    description: 'AI 辅助阅读、批注与知识流整理工具',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FAF8F4',
    theme_color: '#C8783F',
    categories: ['books', 'education', 'productivity'],
    icons: [
      {
        src: '/aether-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/aether-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
