const REPO_API_URL = 'https://api.github.com/repos/inkeep/open-knowledge';

export async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(REPO_API_URL, {
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 3600 },
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'openknowledge.ai site nav',
      },
    });
    if (!res.ok) {
      console.warn(`[github-stars] GitHub API responded ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { stargazers_count?: unknown };
    return typeof json.stargazers_count === 'number' ? json.stargazers_count : null;
  } catch (err) {
    console.warn(
      `[github-stars] fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
