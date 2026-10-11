/** This build's identity (version, commit, build time), injected at build time. */
export interface BuildInfo {
  version: string
  commit: string
  builtAt: string
}

export const BUILD: BuildInfo = typeof __APP_BUILD__ === 'undefined' ? { version: 'dev', commit: 'unknown', builtAt: '' } : __APP_BUILD__

/** "0.1.0 (abc1234, built 11 Oct 2026)". */
export function describeBuild(build: BuildInfo = BUILD): string {
  const date = build.builtAt ? new Date(build.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return `${build.version} (${build.commit}${date ? `, built ${date}` : ''})`
}
