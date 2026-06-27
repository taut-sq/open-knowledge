import { DownloadIcon } from 'lucide-react';
import { DOWNLOAD_ROUTE } from '@/lib/site';

type DownloadButtonProps = {
  href?: string;
  label?: string;
};

export function DownloadButton({
  href = DOWNLOAD_ROUTE,
  label = 'DOWNLOAD FOR MAC',
}: DownloadButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="not-prose my-4 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
    >
      {label}
      <DownloadIcon className="size-4" aria-hidden="true" />
    </a>
  );
}
