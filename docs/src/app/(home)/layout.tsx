import { getGitHubStars } from '@/lib/github-stars';
import { SiteNav } from './site-nav';

export default async function Layout({ children }: LayoutProps<'/'>) {
  const stars = await getGitHubStars();
  return (
    <>
      <SiteNav stars={stars} />
      <main>{children}</main>
    </>
  );
}
