
export const BRAND_ROUTE = '/brand';
export const BRAND_ZIP = '/brand/openknowledge-brand.zip';

export type BrandAsset = {
  id: string;
  alt: string;
  svg: string;
  png: string;
  downloadName: string;
  tile: 'white' | 'brand' | 'muted';
};

export const BRAND_ASSETS: BrandAsset[] = [
  {
    id: 'logo',
    alt: 'OpenKnowledge logo',
    svg: '/brand/openknowledge-logo.svg',
    png: '/brand/openknowledge-logo.png',
    downloadName: 'openknowledge-logo',
    tile: 'white',
  },
  {
    id: 'logo-white',
    alt: 'OpenKnowledge logo, white',
    svg: '/brand/openknowledge-logo-white.svg',
    png: '/brand/openknowledge-logo-white.png',
    downloadName: 'openknowledge-logo-white',
    tile: 'brand',
  },
  {
    id: 'icon',
    alt: 'OpenKnowledge icon',
    svg: '/brand/openknowledge-icon.svg',
    png: '/brand/openknowledge-icon.png',
    downloadName: 'openknowledge-icon',
    tile: 'muted',
  },
];
