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
        resources: {
            en: { translation: en },
            'pt-BR': { translation: ptBR },
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
