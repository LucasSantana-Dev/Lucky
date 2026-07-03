import { describe, expect, it } from '@jest/globals'
import { detectRolesFromText, normalize, JOB_ALIASES } from './roleTextMatcher'

const MAPPINGS = [
    { label: 'Python', roleId: 'r-python' },
    { label: 'Javascript', roleId: 'r-js' },
    { label: 'TypeScript', roleId: 'r-ts' },
    { label: 'Java', roleId: 'r-java' },
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

function ids(text: string, opts: Record<string, unknown> = {}) {
    return detectRolesFromText(text, MAPPINGS, {
        aliases: JOB_ALIASES,
        ...opts,
    }).map((t) => t.roleId)
}

describe('normalize', () => {
    it('strips diacritics and lowercases', () => {
        expect(normalize('Híbrido Graduação Sênior')).toBe(
            'hibrido graduacao senior',
        )
    })
})

describe('detectRolesFromText', () => {
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

    it('tags both React Native and React when "React Native" appears', () => {
        // "React Native" tags RN; the substring "react" also legitimately tags
        // React (a React Native dev is a React dev). Assert both are present.
        const got = ids('Experiência com React Native')
        expect(got).toContain('r-rn')
        expect(got).toContain('r-react')
    })

    it('maps education phrasing to graduation roles', () => {
        expect(ids('Ensino superior completo')).toContain('r-grad')
        expect(ids('Cursando Engenharia da Computação')).toContain('r-cursando')
    })

    it('always includes the Vagas notify role when provided', () => {
        expect(ids('qualquer coisa', { notifyRoleId: 'r-vagas' })).toContain(
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
        const got = ids('Python, python e PYTHON', { notifyRoleId: 'r-vagas' })
        expect(got.filter((r) => r === 'r-python')).toHaveLength(1)
    })

    it('does not tag Java when only Javascript is mentioned', () => {
        // "javascript" contains "java" as a substring; the word-boundary check
        // must prevent tagging the Java role.
        const got = ids('Somente Javascript')
        expect(got).toContain('r-js')
        expect(got).not.toContain('r-java')
    })

    it('tags Java when Java is mentioned standalone', () => {
        expect(ids('Vaga para dev Java')).toContain('r-java')
    })
})
