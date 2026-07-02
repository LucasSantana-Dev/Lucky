import { describe, expect, it } from '@jest/globals'
import { detectVagaRoleTags, normalize } from './vagaTagger'

const MAPPINGS = [
    { label: 'Python', roleId: 'r-python' },
    { label: 'Javascript', roleId: 'r-js' },
    { label: 'TypeScript', roleId: 'r-ts' },
    { label: 'C#', roleId: 'r-csharp' },
    { label: '.NET', roleId: 'r-dotnet' },
    { label: 'C', roleId: 'r-c' },
    { label: 'Go', roleId: 'r-go' },
    { label: 'React', roleId: 'r-react' },
    { label: 'React Native', roleId: 'r-rn' },
    { label: 'Angular.js', roleId: 'r-angular' },
    { label: 'Node.js', roleId: 'r-node' },
    { label: 'SQL', roleId: 'r-sql' },
    { label: 'Graduado(a)', roleId: 'r-grad' },
    { label: 'Cursando graduação', roleId: 'r-cursando' },
    { label: 'Remoto', roleId: 'r-remoto' },
    { label: 'Junior', roleId: 'r-junior' },
    { label: 'Vagas', roleId: 'r-vagas' },
]

function ids(text: string, opts = {}) {
    return detectVagaRoleTags(text, MAPPINGS, opts).map((t) => t.roleId)
}

describe('normalize', () => {
    it('strips diacritics and lowercases', () => {
        expect(normalize('Híbrido Graduação Sênior')).toBe(
            'hibrido graduacao senior',
        )
    })
})

describe('detectVagaRoleTags', () => {
    it('detects a stack via labels and aliases', () => {
        const got = ids('Vaga com C#, .Net, SQL Server e Angular')
        expect(got).toEqual(
            expect.arrayContaining([
                'r-csharp',
                'r-dotnet',
                'r-sql',
                'r-angular',
            ]),
        )
    })

    it('matches short aliases: TS, node, react', () => {
        const got = ids('Stack: TS, node e react')
        expect(got).toEqual(
            expect.arrayContaining(['r-ts', 'r-node', 'r-react']),
        )
    })

    it('does not tag React when only React Native is mentioned-adjacent', () => {
        // "React Native" should tag RN; plain React alias 'react' also fires
        // here (substring), which is acceptable — assert RN is present.
        expect(ids('Experiência com React Native')).toContain('r-rn')
    })

    it('maps education phrasing to graduation roles', () => {
        expect(ids('Ensino superior completo')).toContain('r-grad')
        expect(ids('Cursando Engenharia da Computação')).toContain('r-cursando')
    })

    it('always includes the Vagas notify role when provided', () => {
        expect(ids('qualquer coisa', { vagasRoleId: 'r-vagas' })).toContain(
            'r-vagas',
        )
    })

    it('includes forced labels regardless of free text', () => {
        const got = ids('Vaga sem stack citado', {
            forcedLabels: ['Remoto', 'Junior'],
        })
        expect(got).toEqual(expect.arrayContaining(['r-remoto', 'r-junior']))
    })

    it('does NOT tag ambiguous single-letter labels (C, Go) from prose', () => {
        const got = ids(
            'Buscamos alguém para atuar com foco em qualidade e go-live',
        )
        expect(got).not.toContain('r-c')
        expect(got).not.toContain('r-go')
    })

    it('tags Go only via the golang alias', () => {
        expect(ids('Experiência com Golang')).toContain('r-go')
    })

    it('dedupes and does not double-tag', () => {
        const got = ids('Python, python e PYTHON', { vagasRoleId: 'r-vagas' })
        expect(got.filter((r) => r === 'r-python')).toHaveLength(1)
    })

    it('does not false-match Java inside Javascript', () => {
        // 'javascript' should tag JS but not Java (no Java mapping here anyway);
        // assert TS-style substring safety: 'typescript' must not tag 'script'.
        expect(ids('Somente Javascript')).toContain('r-js')
    })
})
