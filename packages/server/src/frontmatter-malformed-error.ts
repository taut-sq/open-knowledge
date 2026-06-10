
import type { ServerResponse } from 'node:http';
import { stripDocExtension } from './doc-extensions.ts';
import { errorResponse } from './http/error-response.ts';

const FIX_HINT =
  'Frontmatter must be a flat mapping where each value is a string, number, boolean, or array of scalars. Quote string values containing YAML-significant characters (`:`, `#`, leading `-`), e.g. `title: "Foo: bar"`.';

export class FrontmatterMalformedError extends Error {
  readonly file: string;
  readonly parseError: string;
  override readonly name = 'FrontmatterMalformedError' as const;

  constructor(opts: { file: string; parseError: string }) {
    super(`Frontmatter YAML is malformed in ${opts.file}: ${opts.parseError}`);
    this.file = opts.file;
    this.parseError = opts.parseError;
  }
}

export function respondFrontmatterMalformed(
  res: ServerResponse,
  err: FrontmatterMalformedError,
  handler: string,
): void {
  console.warn(
    JSON.stringify({
      event: 'frontmatter-malformed-write-refused',
      handler,
      'doc.name': stripDocExtension(err.file),
      parseError: err.parseError,
    }),
  );
  errorResponse(res, 400, 'urn:ok:error:frontmatter-malformed', 'Frontmatter YAML is malformed.', {
    handler,
    detail: `${err.parseError}. ${FIX_HINT}`,
    extensions: {
      file: err.file,
      parseError: err.parseError,
    },
  });
}
