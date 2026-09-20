import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from '@/locales/en.json'
import ptBR from '@/locales/pt-BR.json'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        // Each top-level group is exposed BOTH under the default `translation`
        // namespace (pages call t('group.key')) AND as its own namespace (pages
        // using useTranslation('group') + t('key')). Both conventions are in use.
        resources: {
            en: { translation: en, ...en },
            'pt-BR': { translation: ptBR, ...ptBR },
        },
        fallbackLng: 'en',
        supportedLngs: SUPPORTED_LANGUAGES,
        nonExplicitSupportedLngs: true,
        interpolation: { escapeValue: false },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'lucky-language',
            caches: ['localStorage'],
            convertDetectedLanguage: (lng: string) =>
                lng.toLowerCase().startsWith('pt') ? 'pt-BR' : lng,
        },
        returnNull: false,
    })

export default i18n
