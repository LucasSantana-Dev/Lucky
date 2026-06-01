import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from 'i18next'
import LanguageSwitcher from './LanguageSwitcher'
import * as en from '@/locales/en.json'
import * as ptBR from '@/locales/pt-BR.json'

// Mock i18n initialization
i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: { translation: en },
        'pt-BR': { translation: ptBR },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
})

describe('LanguageSwitcher', () => {
    beforeEach(() => {
        // Reset to English before each test
        void i18n.changeLanguage('en')
    })

    it('renders language switcher with current language label', () => {
        render(
            <I18nextProvider i18n={i18n}>
                <LanguageSwitcher />
            </I18nextProvider>,
        )

        expect(screen.getByTitle('Language')).toBeInTheDocument()
    })

    it('opens dropdown and displays language options', async () => {
        const user = userEvent.setup()
        render(
            <I18nextProvider i18n={i18n}>
                <LanguageSwitcher />
            </I18nextProvider>,
        )

        const trigger = screen.getByTitle('Language')
        await user.click(trigger)

        // Both language options should be visible
        const languageOptions = screen.getAllByText('English')
        expect(languageOptions.length).toBeGreaterThan(1) // trigger + dropdown item
        expect(screen.getByText('Português (Brasil)')).toBeInTheDocument()
    })

    it('changes language when selecting Portuguese', async () => {
        const user = userEvent.setup()
        const { rerender } = render(
            <I18nextProvider i18n={i18n}>
                <LanguageSwitcher />
            </I18nextProvider>,
        )

        const trigger = screen.getByTitle('Language')
        await user.click(trigger)

        const ptBrOption = screen.getByText('Português (Brasil)')
        await user.click(ptBrOption)

        // Wait for i18n to update and re-render
        await new Promise((resolve) => setTimeout(resolve, 100))
        rerender(
            <I18nextProvider i18n={i18n}>
                <LanguageSwitcher />
            </I18nextProvider>,
        )

        // The language should have changed to Portuguese
        expect(i18n.language).toBe('pt-BR')
    })

    it('changes language when selecting English from Portuguese', async () => {
        const user = userEvent.setup()

        // Start with Portuguese
        await i18n.changeLanguage('pt-BR')

        const { rerender } = render(
            <I18nextProvider i18n={i18n}>
                <LanguageSwitcher />
            </I18nextProvider>,
        )

        const trigger = screen.getByTitle('Language')
        await user.click(trigger)

        const enOptions = screen.getAllByText('English')
        // Click the dropdown item (not the trigger)
        await user.click(enOptions[enOptions.length - 1])

        // Wait for i18n to update
        await new Promise((resolve) => setTimeout(resolve, 100))
        rerender(
            <I18nextProvider i18n={i18n}>
                <LanguageSwitcher />
            </I18nextProvider>,
        )

        // The language should have changed to English
        expect(i18n.language).toBe('en')
    })
})
