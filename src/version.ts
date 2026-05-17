/**
 * Yujin Forge CLI version. Single source of truth -- package.json
 * reads from this at publish time (the publish script copies it
 * into the npm metadata) so we don't end up with two versions
 * drifting.
 */
export const VERSION = '0.1.0';
