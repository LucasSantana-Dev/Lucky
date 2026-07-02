/**
 * Detects which reaction-role roles a job post should ping, by matching the
 * post text against the guild's reaction-role labels (data-driven — no
 * hard-coded role ids). Conservative by design: it prefers missing a tag over
 * adding a wrong one, since the result is pinged in a public channel.
 */

export interface RoleTag {
    label: string
    roleId: string
}

/** Lowercase + strip diacritics so "Híbrido"/"graduação" match plainly. */
export function normalize(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Extra match terms per canonical label (already normalized: lowercase, no
 * diacritics). The label itself is always tried too. Labels not listed here
 * are matched by their own normalized text as a word-bounded phrase.
 */
const ALIASES: Record<string, string[]> = {
    Javascript: ['javascript', 'js'],
    TypeScript: ['typescript', 'ts'],
    'Node.js': ['node.js', 'nodejs', 'node'],
    'Angular.js': ['angular.js', 'angularjs', 'angular'],
    'Vue.js': ['vue.js', 'vuejs', 'vue'],
    'Next.js': ['next.js', 'nextjs', 'next'],
    'React Native': ['react native', 'react-native'],
    React: ['reactjs', 'react.js'],
    '.NET': ['.net', 'dotnet', 'asp.net'],
    'C#': ['c#', 'csharp', 'c-sharp'],
    'C++': ['c++', 'cpp'],
    Go: ['golang'],
    PostgreSQL: ['postgresql', 'postgres'],
    Kubernetes: ['kubernetes', 'k8s'],
    SQL: ['sql', 'sql server', 'mysql', 'sqlserver'],
    'No/Low-Code': ['no-code', 'low-code', 'no code', 'low code', 'nocode'],
    Junior: ['junior', 'júnior', 'jr', 'jr.'],
    Pleno: ['pleno'],
    Senior: ['senior', 'sênior', 'sr', 'sr.'],
    Estágio: ['estagio', 'estagiario', 'estagiário', 'intern'],
    'Cursando graduação': [
        'cursando',
        'em andamento',
        'estudante',
        'graduacao em andamento',
        'superior em andamento',
    ],
    'Graduado(a)': [
        'graduado',
        'graduada',
        'formado',
        'formada',
        'superior completo',
        'ensino superior completo',
    ],
    'Sem graduação': ['sem graduacao', 'sem ensino superior'],
    Remoto: ['remoto', 'remote', 'home office', 'home-office', '100% remoto'],
    Presencial: ['presencial', 'on-site', 'onsite'],
    Híbrido: ['hibrido', 'hybrid'],
}

/**
 * Labels that are single letters or otherwise too ambiguous to match by a bare
 * word boundary (would fire on unrelated prose). We only tag these via the
 * explicit senioridade/modalidade choices or a very specific alias, never by
 * scanning free text.
 */
const SKIP_FREE_TEXT = new Set(['C', 'R', 'Go'])

function buildPattern(term: string): RegExp {
    // Escape regex metachars, then require a boundary that also works when the
    // term ends in a symbol (#, +, .) where \b would misbehave.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
}

function termsFor(label: string): string[] {
    const base = normalize(label)
    const aliases = ALIASES[label] ?? []
    // Go still gets 'golang' (unambiguous) even though bare 'go' is skipped.
    if (SKIP_FREE_TEXT.has(label)) {
        return aliases
    }
    return [base, ...aliases]
}

/**
 * Returns the roles to tag for a job post, deduped, preserving mapping order.
 * `vagasRoleId` (the "Notificados de Vagas" role) is always included when given.
 * `forcedLabels` come from explicit slash-command choices (modalidade,
 * senioridade) and are matched by label regardless of free-text detection.
 */
export function detectVagaRoleTags(
    text: string,
    mappings: RoleTag[],
    opts: { vagasRoleId?: string; forcedLabels?: string[] } = {},
): RoleTag[] {
    const haystack = normalize(text)
    const forced = new Set(opts.forcedLabels ?? [])
    const seen = new Set<string>()
    const result: RoleTag[] = []

    const push = (tag: RoleTag) => {
        if (tag.roleId && !seen.has(tag.roleId)) {
            seen.add(tag.roleId)
            result.push(tag)
        }
    }

    if (opts.vagasRoleId) {
        push({ label: 'Vagas', roleId: opts.vagasRoleId })
    }

    for (const m of mappings) {
        const isForced = forced.has(m.label)
        const matched =
            isForced ||
            termsFor(m.label).some((term) => buildPattern(term).test(haystack))
        if (matched) {
            push(m)
        }
    }

    return result
}
