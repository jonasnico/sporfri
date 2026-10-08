// Engine + the real rules, as used by the apps.
import * as engine from '../src/engine.ts';
import rules from '../rules/rules.json' with { type: 'json' };

export default { ...engine, ...engine.createCleaner(rules), rules };
