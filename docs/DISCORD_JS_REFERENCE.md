# Discord.js Quick Reference

Quick reference guide for common Discord.js patterns and operations used in LukBot.

## Table of Contents

- [Slash Commands](#slash-commands)
- [Interactions](#interactions)
- [Embeds](#embeds)
- [Permissions](#permissions)
- [Voice](#voice)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Slash Commands

### Basic Command Structure

```typescript
import { SlashCommandBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply('Pong!')
    },
}
```

### Command with String Option

```typescript
const command = new SlashCommandBuilder()
  .setName('echo')
  .setDescription('Echoes your message')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('Message to echo')
      .setRequired(true)
  );

async execute(interaction: ChatInputCommandInteraction) {
  const message = interaction.options.getString('message', true);
  await interaction.reply(message);
}
```

### Command with User Option

```typescript
const command = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Get information about a user')
  .addUserOption(option =>
    option
      .setName('target')
      .setDescription('User to get info about')
      .setRequired(false)
  );

async execute(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('target') ?? interaction.user;
  await interaction.reply(`User: ${user.tag}, ID: ${user.id}`);
}
```

### Command with Choices

```typescript
const command = new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set volume level')
    .addStringOption((option) =>
        option
            .setName('level')
            .setDescription('Volume level')
            .setRequired(true)
            .addChoices(
                { name: 'Low', value: '25' },
                { name: 'Medium', value: '50' },
                { name: 'High', value: '75' },
                { name: 'Max', value: '100' },
            ),
    )
```

### Command with Autocomplete

```typescript
const command = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song')
    .addStringOption((option) =>
        option
            .setName('query')
            .setDescription('Song to play')
            .setRequired(true)
            .setAutocomplete(true),
    )

// Handle autocomplete
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isAutocomplete()) return

    const focusedValue = interaction.options.getFocused()
    const choices = await searchSongs(focusedValue)

    await interaction.respond(
        choices.map((choice) => ({ name: choice.title, value: choice.url })),
    )
})
```

### Command with Permissions

```typescript
import { PermissionFlagsBits } from 'discord.js'

const command = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
        option
            .setName('target')
            .setDescription('User to ban')
            .setRequired(true),
    )
```

---

## Interactions

### Deferred Replies

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  // Defer if operation takes > 3 seconds
  await interaction.deferReply();

  // Do long operation
  const result = await longOperation();

  // Edit deferred reply
  await interaction.editReply(result);
}
```

### Ephemeral Replies

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  // Only visible to user who ran command
  await interaction.reply({
    content: 'This is a secret message!',
    ephemeral: true
  });
}
```

### Follow-up Messages

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply('First message');

  // Send follow-up
  await interaction.followUp('Second message');

  // Ephemeral follow-up
  await interaction.followUp({
    content: 'Secret follow-up',
    ephemeral: true
  });
}
```

### Buttons

```typescript
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
        .setCustomId('primary')
        .setLabel('Click me!')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setCustomId('danger')
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
        .setLabel('Link')
        .setURL('https://discord.js.org')
        .setStyle(ButtonStyle.Link),
)

await interaction.reply({
    content: 'Choose an option:',
    components: [row],
})

// Handle button click
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return

    if (interaction.customId === 'primary') {
        await interaction.reply('You clicked the primary button!')
    }
})
```

### Select Menus

```typescript
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js'

const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
        .setCustomId('select')
        .setPlaceholder('Choose an option')
        .addOptions([
            {
                label: 'Option 1',
                description: 'This is option 1',
                value: 'option1',
            },
            {
                label: 'Option 2',
                description: 'This is option 2',
                value: 'option2',
            },
        ]),
)

await interaction.reply({
    content: 'Select an option:',
    components: [row],
})

// Handle selection
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return

    const selected = interaction.values[0]
    await interaction.reply(`You selected: ${selected}`)
})
```

### Modals

```typescript
import {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js'

// Show modal
const modal = new ModalBuilder().setCustomId('myModal').setTitle('My Modal')

const input = new TextInputBuilder()
    .setCustomId('favoriteColor')
    .setLabel('What is your favorite color?')
    .setStyle(TextInputStyle.Short)

const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input)
modal.addComponents(row)

await interaction.showModal(modal)

// Handle modal submission
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return

    const color = interaction.fields.getTextInputValue('favoriteColor')
    await interaction.reply(`Your favorite color is ${color}!`)
})
```

---

## Embeds

### Basic Embed

```typescript
import { EmbedBuilder } from 'discord.js'

const embed = new EmbedBuilder()
    .setTitle('Embed Title')
    .setDescription('This is the description')
    .setColor('#5865F2')
    .setTimestamp()

await interaction.reply({ embeds: [embed] })
```

### Rich Embed

```typescript
const embed = new EmbedBuilder()
    .setTitle('Now Playing')
    .setURL('https://youtube.com/watch?v=...')
    .setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription('Song description')
    .setThumbnail('https://i.ytimg.com/vi/.../maxresdefault.jpg')
    .addFields(
        { name: 'Duration', value: '3:45', inline: true },
        { name: 'Artist', value: 'Artist Name', inline: true },
        { name: 'Album', value: 'Album Name', inline: true },
    )
    .setImage('https://example.com/image.png')
    .setFooter({
        text: 'Requested by ' + interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp()
```

### Embed with Color

```typescript
// Hex color
const embed = new EmbedBuilder().setColor('#FF0000')

// RGB color
const embed = new EmbedBuilder().setColor([255, 0, 0])

// Predefined colors
const embed = new EmbedBuilder().setColor('Red')
const embed = new EmbedBuilder().setColor('Random')
```

### Multiple Embeds

```typescript
const embed1 = new EmbedBuilder().setTitle('First Embed').setColor('#FF0000')

const embed2 = new EmbedBuilder().setTitle('Second Embed').setColor('#00FF00')

await interaction.reply({ embeds: [embed1, embed2] })
```

### Paginated Embeds

```typescript
const pages = [
    new EmbedBuilder().setTitle('Page 1').setDescription('Content 1'),
    new EmbedBuilder().setTitle('Page 2').setDescription('Content 2'),
    new EmbedBuilder().setTitle('Page 3').setDescription('Content 3'),
]

let currentPage = 0

const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
        .setCustomId('previous')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
    new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary),
)

const message = await interaction.reply({
    embeds: [pages[currentPage]],
    components: [row],
    fetchReply: true,
})

const collector = message.createMessageComponentCollector({
    time: 60000, // 1 minute
})

collector.on('collect', async (i) => {
    if (i.customId === 'previous') currentPage--
    if (i.customId === 'next') currentPage++

    await i.update({
        embeds: [pages[currentPage]],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === pages.length - 1),
            ),
        ],
    })
})
```

---

## Permissions

### Check User Permissions

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;

  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: 'You need Manage Messages permission!',
      ephemeral: true
    });
  }

  // Command logic
}
```

### Check Multiple Permissions

```typescript
const requiredPermissions = [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageChannels,
]

if (!member.permissions.has(requiredPermissions)) {
    return interaction.reply({
        content: 'You lack required permissions!',
        ephemeral: true,
    })
}
```

### Check Bot Permissions

```typescript
const botMember = interaction.guild.members.me

if (!botMember.permissions.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({
        content: 'I need Send Messages permission!',
        ephemeral: true,
    })
}
```

### Check Channel Permissions

```typescript
const channel = interaction.channel

if (
    !channel
        .permissionsFor(interaction.guild.members.me)
        .has(PermissionFlagsBits.SendMessages)
) {
    return interaction.reply({
        content: 'I cannot send messages in this channel!',
        ephemeral: true,
    })
}
```

### Role Hierarchy

```typescript
const targetMember = interaction.options.getMember('target') as GuildMember
const executorMember = interaction.member as GuildMember

// Check if executor can moderate target
if (
    targetMember.roles.highest.position >= executorMember.roles.highest.position
) {
    return interaction.reply({
        content: 'You cannot moderate this user!',
        ephemeral: true,
    })
}

// Check if bot can moderate target
const botMember = interaction.guild.members.me
if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.reply({
        content: 'I cannot moderate this user!',
        ephemeral: true,
    })
}
```

---

## Voice

### Join Voice Channel

```typescript
import { joinVoiceChannel } from '@discordjs/voice';

async execute(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({
      content: 'You need to be in a voice channel!',
      ephemeral: true
    });
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator,
  });

  await interaction.reply('Joined voice channel!');
}
```

### Leave Voice Channel

```typescript
import { getVoiceConnection } from '@discordjs/voice'

const connection = getVoiceConnection(interaction.guild.id)

if (connection) {
    connection.destroy()
    await interaction.reply('Left voice channel!')
} else {
    await interaction.reply('Not in a voice channel!')
}
```

### Check Voice State

```typescript
const member = interaction.member as GuildMember

if (!member.voice.channel) {
    return interaction.reply('You are not in a voice channel!')
}

if (member.voice.serverMute) {
    return interaction.reply('You are server muted!')
}

if (member.voice.serverDeaf) {
    return interaction.reply('You are server deafened!')
}
```

---

## Error Handling

### Try-Catch Pattern

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();

    const result = await riskyOperation();

    await interaction.editReply(result);
  } catch (error) {
    console.error('Command error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `Error: ${errorMessage}`
      });
    } else {
      await interaction.reply({
        content: `Error: ${errorMessage}`,
        ephemeral: true
      });
    }
  }
}
```

### Global Error Handler

```typescript
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return

    const command = client.commands.get(interaction.commandName)
    if (!command) return

    try {
        await command.execute(interaction)
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error)

        const reply = {
            content: 'There was an error executing this command!',
            ephemeral: true,
        }

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply)
        } else {
            await interaction.reply(reply)
        }
    }
})
```

### API Error Handling

```typescript
import { DiscordAPIError } from 'discord.js'

try {
    await member.ban({ reason: 'Spam' })
} catch (error) {
    if (error instanceof DiscordAPIError) {
        if (error.code === 50013) {
            // Missing Permissions
            await interaction.reply('I lack permissions to ban this user!')
        } else if (error.code === 10007) {
            // Unknown Member
            await interaction.reply('User not found!')
        } else {
            await interaction.reply(`Discord API Error: ${error.message}`)
        }
    } else {
        throw error
    }
}
```

---

## Best Practices

### 1. Always Respond to Interactions

```typescript
// Good
async execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  // ... long operation
  await interaction.editReply('Done!');
}

// Bad - will timeout after 3 seconds
async execute(interaction: ChatInputCommandInteraction) {
  // ... long operation without deferring
  await interaction.reply('Done!'); // Too late!
}
```

### 2. Use Ephemeral for Errors

```typescript
// Good - errors are private
if (!hasPermission) {
    return interaction.reply({
        content: 'You lack permissions!',
        ephemeral: true,
    })
}

// Bad - errors are public
if (!hasPermission) {
    return interaction.reply('You lack permissions!')
}
```

### 3. Validate Input

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  const volume = interaction.options.getInteger('volume', true);

  if (volume < 0 || volume > 100) {
    return interaction.reply({
      content: 'Volume must be between 0 and 100!',
      ephemeral: true
    });
  }

  // Use validated input
}
```

### 4. Use Type Guards

```typescript
import { GuildMember } from 'discord.js';

async execute(interaction: ChatInputCommandInteraction) {
  // Type guard
  if (!(interaction.member instanceof GuildMember)) {
    return interaction.reply('This command can only be used in a server!');
  }

  // Now TypeScript knows member is GuildMember
  const roles = interaction.member.roles.cache;
}
```

### 5. Clean Up Resources

```typescript
const collector = message.createMessageComponentCollector({
    time: 60000,
})

collector.on('collect', async (i) => {
    // Handle interaction
})

collector.on('end', async () => {
    // Clean up - disable buttons
    await message.edit({
        components: [],
    })
})
```

### 6. Rate Limiting

```typescript
const cooldowns = new Map<string, number>();

async execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownAmount = 5000; // 5 seconds

  if (cooldowns.has(userId)) {
    const expirationTime = cooldowns.get(userId)! + cooldownAmount;

    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return interaction.reply({
        content: `Please wait ${timeLeft.toFixed(1)} seconds!`,
        ephemeral: true
      });
    }
  }

  cooldowns.set(userId, now);
  setTimeout(() => cooldowns.delete(userId), cooldownAmount);

  // Command logic
}
```

### 7. Logging

```typescript
async execute(interaction: ChatInputCommandInteraction) {
  console.log(`[${new Date().toISOString()}] ${interaction.user.tag} used /${interaction.commandName}`);

  try {
    // Command logic
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in /${interaction.commandName}:`, error);
    throw error;
  }
}
```

---

## Common Patterns

### Command with Subcommands

```typescript
const command = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Music commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('play')
      .setDescription('Play a song')
      .addStringOption(option =>
        option.setName('query').setDescription('Song to play').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('Stop playback')
  );

async execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'play') {
    const query = interaction.options.getString('query', true);
    // Play logic
  } else if (subcommand === 'stop') {
    // Stop logic
  }
}
```

### Confirmation Dialog

```typescript
const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
        .setCustomId('confirm')
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
)

const response = await interaction.reply({
    content: 'Are you sure you want to delete everything?',
    components: [row],
    ephemeral: true,
})

const collector = response.createMessageComponentCollector({
    time: 15000, // 15 seconds
})

collector.on('collect', async (i) => {
    if (i.customId === 'confirm') {
        await i.update({ content: 'Confirmed!', components: [] })
        // Do destructive action
    } else {
        await i.update({ content: 'Cancelled!', components: [] })
    }
})

collector.on('end', async (collected) => {
    if (collected.size === 0) {
        await interaction.editReply({ content: 'Timed out!', components: [] })
    }
})
```

---

## Additional Resources

- [Discord.js Guide](https://discordjs.guide/)
- [Discord.js Documentation](https://discord.js.org/docs/)
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Library References](./LIBRARY_REFERENCES.md)
- [Code Examples](./CODE_EXAMPLES.md)

---

**Last Updated:** February 2026
