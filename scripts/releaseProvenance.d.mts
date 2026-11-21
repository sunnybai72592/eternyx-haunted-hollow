export interface ReleaseStamp {
  readonly schema: 1;
  readonly project: "eternyx";
  readonly build_id: string;
  readonly source_sha: string | null;
  readonly source_sha_origin: "git-checkout" | "unavailable";
  readonly built_at: string;
  readonly production_verified: false;
}

export interface ReleaseStampOptions {
  cwd?: string;
  buildId?: string;
  now?: string;
}

export function validatedSha(candidate: unknown): string | null;
export function readCheckedOutSha(cwd?: string): string | null;
export function createReleaseStamp(options?: ReleaseStampOptions): Readonly<ReleaseStamp>;
