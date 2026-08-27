import i18next, { type TFunction } from 'i18next'
import {
    SUPPORTED_BOT_LANGUAGES,
    DEFAULT_BOT_LANGUAGE,
    type BotLanguage,
} from '@lucky/shared/constants'
// `with { type: 'json' }` is REQUIRED, not decoration. This package is
// "type": "module", so the built output is real ESM and Node refuses a JSON
// import without the attribute:
//   ERR_IMPORT_ATTRIBUTE_MISSING: Module ".../dist/locales/en.json" needs an
//   import attribute of "type: json"
// It shipped in v2.40.0 and crash-looped the bot at boot. Nothing in CI runs
// the built output: jest transpiles to CJS, where a bare JSON import is legal,
// and `npm run build` compiles without executing. A static gate for this class
// is in #2114.
import en from '../locales/en.json' with { type: 'json' }
import ptBR from '../locales/pt-BR.json' with { type: 'json' }
import es from '../locales/es.json' with { type: 'json' }

/**
 * Bot-side i18n.
 *
 * The bot serves many Guilds from ONE process, each potentially on a different
 * language, so `i18next.changeLanguage()` is unusable here: it mutates global
 * state and would race between Guilds mid-reply. This module therefore never
 * exports the i18next instance, only `translatorFor(language)`, which hands back
 * a language-bound `TFunction` via `getFixedT`. Keep it that way; exporting the
 * instance is what would let a call site reintroduce the race.
 *
 * Catalogues live here rather than in `shared` because the bot's vocabulary
 * ("added to the queue") and the dashboard's ("Save changes") barely overlap.
 */

let initialised = false

function ensureInitialised(): void {
    if (initialised) return
    void i18next.init({
        resources: {
            en: { translation: en },
            'pt-BR': { translation: ptBR },
            es: { translation: es },
        },
        lng: DEFAULT_BOT_LANGUAGE,
        fallbackLng: DEFAULT_BOT_LANGUAGE,
        supportedLngs: [...SUPPORTED_BOT_LANGUAGES],
        // `fallbackLng` alone satisfies spec D6: a key present in `en` but
        // missing in `pt-BR`/`es` renders the English string, never its own
        // path. Deliberately NO parseMissingKeyHandler here. An earlier version
        // used one to look the key up in English by hand, which recursed
        // forever when the key was missing from every catalogue. A key missing
        // everywhere is a build-time problem, caught by the locale key-parity
        // gate, not something to paper over at runtime.
        interpolation: {
            // Discord renders plain text, not HTML. Escaping here would turn an
            // apostrophe in a track title into `&#39;`.
            escapeValue: false,
        },
        returnNull: false,
    })
    initialised = true
}

/**
 * A translator bound to one language. Safe to hold across awaits, because it
 * closes over its language instead of reading a global.
 */
export function translatorFor(language: BotLanguage): TFunction {
    ensureInitialised()
    return i18next.getFixedT(language)
}
