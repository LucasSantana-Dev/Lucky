export const messages = {
  error: {
    guildOnly: '👥 Este comando só pode ser usado em um servidor!',
    voiceChannel: '🔈 Você precisa estar em um canal de voz!',
    noQueue: '🤔 Não tem nenhuma música tocando no momento.',
    noTrack: 'Nenhuma música está tocando!',
    notPlaying: '🤔 Não há música tocando no momento.',
    volumeRange: '🔊 O volume deve ser entre 1 e 100!',
    noQuery: '❌ Você precisa fornecer um termo de busca ou URL.',
    noResult: '❌ Nenhum resultado encontrado.',
    generic: '❌ Ocorreu um erro ao processar sua solicitação.',
    downloadFailed: '❌ Falha no download do conteúdo.',
    invalidOption: '❌ Opção inválida.',
    nonHandledError: '❌ Ocorreu um erro não tratado. Por favor, tente novamente mais tarde.'
  },
  success: {
    volumeSet: (value: number) => `🔊 O volume foi definido para ${value}%`,
    currentVolume: (value: number) => `🔊 O volume está em ${value}%`
  }
}; 