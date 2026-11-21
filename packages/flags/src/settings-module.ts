/**
 * The subpath `flags/settings`: the static settings. A framework plugin
 * replaces it with a bundler alias of `flags/config.json` of the
 * application. Without the file, the settings are the defaults.
 */
import type { Settings } from './settings';

const settings: Settings = {};

export default settings;
