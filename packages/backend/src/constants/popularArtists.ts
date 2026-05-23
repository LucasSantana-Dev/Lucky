/**
 * Popular artist names used as fallback for artist suggestions.
 * These span multiple genres to provide diverse recommendations
 * when user preferences are unavailable or limited.
 */
export const POPULAR_ARTISTS = [
    // Pop
    'Taylor Swift',
    'Dua Lipa',
    'Ariana Grande',
    'Olivia Rodrigo',
    'Sabrina Carpenter',
    'Billie Eilish',
    'The Weeknd',
    // Hip-hop
    'Drake',
    'Kendrick Lamar',
    'Travis Scott',
    'J. Cole',
    'Tyler The Creator',
    'Future',
    'Nicki Minaj',
    // Rock
    'Foo Fighters',
    'Red Hot Chili Peppers',
    'Arctic Monkeys',
    'Radiohead',
    'The Strokes',
    'Tame Impala',
    // R&B
    'SZA',
    'Frank Ocean',
    'Bruno Mars',
    'H.E.R.',
    'Daniel Caesar',
    // Electronic
    'Daft Punk',
    'Calvin Harris',
    'Flume',
    'ODESZA',
    'Disclosure',
    'Skrillex',
    // Latin
    'Bad Bunny',
    'Anitta',
    'Karol G',
    'J Balvin',
    'Rosalía',
    'Peso Pluma',
    // Country
    'Morgan Wallen',
    'Luke Combs',
    'Kacey Musgraves',
    'Zach Bryan',
    // Indie
    'Phoebe Bridgers',
    'Arcade Fire',
    'Vampire Weekend',
    'Mac DeMarco',
    // K-pop
    'BTS',
    'BLACKPINK',
    'NewJeans',
    'Stray Kids',
    // Classic rock
    'The Beatles',
    'Queen',
    'Pink Floyd',
    'Led Zeppelin',
    // Jazz
    'Miles Davis',
    'John Coltrane',
    'Nina Simone',
    // Metal
    'Metallica',
    'Tool',
    'System of a Down',
    // Brazilian
    'Matuê',
    'Tim Bernardes',
    'Racionais',
    'Djonga',
] as const

export type PopularArtist = (typeof POPULAR_ARTISTS)[number]
