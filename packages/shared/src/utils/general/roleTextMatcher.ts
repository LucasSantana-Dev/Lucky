/**
 * Matches free text against a guild's reaction-role labels to decide which
 * roles to ping (data-driven — no hard-coded role ids). Generic across
 * smart-command kinds: the alias table is supplied by the caller so each kind
 * (job_post today, others later) brings its own vocabulary. Conservative by
 * design: prefers missing a tag over adding a wrong one, since the result is
 * pinged in a public channel.
 */

export interface RoleTag {
    label: string
    roleId: string
}

/** Alias table: canonical label -> extra normalized match terms. */
export type AliasTable = Record<string, string[]>

/** Lowercase + strip diacritics so "Híbrido"/"graduação" match plainly. */
export function normalize(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Default vocabulary for the `job_post` smart-command kind: canonical label ->
 * extra match terms (already normalized: lowercase, no diacritics). The label
 * itself is always tried too; labels not listed here are matched by their own
 * normalized text as a word-bounded phrase.
 */
export const JOB_ALIASES: AliasTable = {
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

const WORD_CHAR = /[a-z0-9]/

function isWordChar(ch: string): boolean {
    return ch !== '' && WORD_CHAR.test(ch)
}

/**
 * Literal (non-regex) substring match with word-ish boundaries. Avoids building
 * a RegExp from dynamic input (ReDoS-safe) and treats symbols like #/+/. that
 * `\b` mishandles as ordinary boundaries. `term` and `haystack` are assumed
 * already normalized (lowercase, no diacritics).
 */
function matchesTerm(haystack: string, term: string): boolean {
    if (!term) return false
    let from = 0
    for (;;) {
        const idx = haystack.indexOf(term, from)
        if (idx === -1) return false
        const before = idx === 0 ? '' : haystack[idx - 1]
        const afterIdx = idx + term.length
        const after = afterIdx >= haystack.length ? '' : haystack[afterIdx]
        if (!isWordChar(before) && !isWordChar(after)) return true
        from = idx + 1
    }
}

function termsFor(label: string, aliases: AliasTable): string[] {
    const base = normalize(label)
    const extra = aliases[label] ?? []
    // Ambiguous labels (Go) still get unambiguous aliases (golang) even though
    // the bare token is skipped.
    if (SKIP_FREE_TEXT.has(label)) {
        return extra
    }
    return [base, ...extra]
}

/**
 * Returns the roles to tag for a chunk of text, deduped, preserving mapping
 * order. `aliases` is the caller-supplied vocabulary (e.g. JOB_ALIASES).
 * `notifyRoleId`, when given, is always included first (e.g. a "Vagas" notify
 * role). `forcedLabels` come from explicit inputs (slash-command choices) and
 * are matched by label regardless of free-text detection.
 */
export function detectRolesFromText(
    text: string,
    mappings: RoleTag[],
    opts: {
        aliases: AliasTable
        notifyRoleId?: string
        forcedLabels?: string[]
    },
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

    if (opts.notifyRoleId) {
        // Surface the real label in user-facing previews when the notify role
        // is itself one of the mappings (cubic P3).
        const label =
            mappings.find((m) => m.roleId === opts.notifyRoleId)?.label ??
            'notify'
        push({ label, roleId: opts.notifyRoleId })
    }

    for (const m of mappings) {
        const isForced = forced.has(m.label)
        const matched =
            isForced ||
            termsFor(m.label, opts.aliases).some((term) =>
                matchesTerm(haystack, term),
            )
        if (matched) {
            push(m)
        }
    }

    return result
}
