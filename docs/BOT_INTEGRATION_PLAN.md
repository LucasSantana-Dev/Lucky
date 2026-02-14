# Bot Integration Plan - Moderation & Management Features

## Current Status

**Database**: ✅ All 23 tables created and ready
**Services**: ✅ Implemented and tested (temporarily disabled due to TS issue)
**Next Phase**: Bot command integration

## Phase 4: Moderation Commands

### Commands to Implement

#### `/warn` - Issue Warning

```typescript
// Location: packages/bot/src/functions/moderation/commands/warn.ts
// Service: ModerationService.createCase()
// Permissions: MODERATE_MEMBERS
```

- **Options**: user (required), reason (optional), silent (boolean)
- **Behavior**: Creates warning case, sends DM to user, logs to server log channel
- **Response**: Embed with case details and case number

#### `/mute` - Timeout User

```typescript
// Location: packages/bot/src/functions/moderation/commands/mute.ts
// Service: ModerationService.createCase()
// Discord API: member.timeout()
// Permissions: MODERATE_MEMBERS
```

- **Options**: user (required), duration (required), reason (optional), silent (boolean)
- **Duration**: Choices: 60s, 5m, 10m, 1h, 1d, 1w
- **Behavior**: Applies Discord timeout, creates case, sends DM, logs
- **Response**: Embed with case details

#### `/unmute` - Remove Timeout

```typescript
// Location: packages/bot/src/functions/moderation/commands/unmute.ts
// Service: ModerationService.createCase()
// Discord API: member.timeout(null)
// Permissions: MODERATE_MEMBERS
```

- **Options**: user (required), reason (optional)
- **Behavior**: Removes timeout, creates case, sends DM, logs
- **Response**: Confirmation embed

#### `/kick` - Kick Member

```typescript
// Location: packages/bot/src/functions/moderation/commands/kick.ts
// Service: ModerationService.createCase()
// Discord API: member.kick()
// Permissions: KICK_MEMBERS
```

- **Options**: user (required), reason (optional), silent (boolean)
- **Behavior**: Kicks user, creates case, sends DM before kick, logs
- **Response**: Embed with case details

#### `/ban` - Ban User

```typescript
// Location: packages/bot/src/functions/moderation/commands/ban.ts
// Service: ModerationService.createCase()
// Discord API: guild.members.ban()
// Permissions: BAN_MEMBERS
```

- **Options**: user (required), reason (optional), delete_messages (choices: 0h, 1h, 6h, 12h, 24h, 7d), silent (boolean)
- **Behavior**: Bans user, creates case, sends DM before ban, logs
- **Response**: Embed with case details

#### `/unban` - Unban User

```typescript
// Location: packages/bot/src/functions/moderation/commands/unban.ts
// Service: ModerationService.createCase()
// Discord API: guild.members.unban()
// Permissions: BAN_MEMBERS
```

- **Options**: user_id (required), reason (optional)
- **Behavior**: Unbans user, creates case, logs
- **Response**: Confirmation embed

### Case Management Commands

#### `/case` - View Case Details

```typescript
// Location: packages/bot/src/functions/moderation/commands/case.ts
// Service: ModerationService.getCase()
// Permissions: MODERATE_MEMBERS
```

- **Subcommands**:
    - `view <case_number>` - Show case details
    - `update <case_number> <reason>` - Update case reason
    - `delete <case_number>` - Delete case (requires ADMINISTRATOR)

#### `/cases` - List Cases

```typescript
// Location: packages/bot/src/functions/moderation/commands/cases.ts
// Service: ModerationService.getUserCases(), getModerationStats()
// Permissions: MODERATE_MEMBERS
```

- **Options**: user (optional), type (optional), page (optional)
- **Behavior**: Paginated list of cases with filters
- **Response**: Embed with case list and navigation buttons

#### `/history` - User Moderation History

```typescript
// Location: packages/bot/src/functions/moderation/commands/history.ts
// Service: ModerationService.getUserCases()
// Permissions: MODERATE_MEMBERS
```

- **Options**: user (required)
- **Behavior**: Shows user's full moderation history with stats
- **Response**: Embed with timeline and statistics

### Moderation Settings Commands

#### `/modsettings` - Configure Moderation

```typescript
// Location: packages/bot/src/functions/moderation/commands/modsettings.ts
// Service: ModerationService.getSettings(), updateSettings()
// Permissions: ADMINISTRATOR
```

- **Subcommands**:
    - `view` - Show current settings
    - `log_channel <channel>` - Set moderation log channel
    - `mute_role <role>` - Set mute role (legacy, prefer timeout)
    - `dm_on_action <boolean>` - Enable/disable DM notifications

## Phase 5: Auto-Moderation Commands

### `/automod` - Auto-Moderation Configuration

```typescript
// Location: packages/bot/src/functions/automod/commands/automod.ts
// Service: AutoModService.getSettings(), updateSettings()
// Permissions: ADMINISTRATOR
```

#### Subcommands:

**`/automod spam`**

- **Options**: enabled (boolean), max_messages (number), timeframe (number), action (warn/mute/kick/ban)
- **Behavior**: Configure spam detection

**`/automod caps`**

- **Options**: enabled (boolean), percentage (number), min_length (number), action
- **Behavior**: Configure caps detection

**`/automod links`**

- **Options**: enabled (boolean), whitelist (string array), action
- **Behavior**: Configure link filtering

**`/automod invites`**

- **Options**: enabled (boolean), allow_own_server (boolean), action
- **Behavior**: Configure invite link filtering

**`/automod words`**

- **Options**: enabled (boolean), words_list (string array), action
- **Behavior**: Configure bad words filter

**`/automod raid`**

- **Options**: enabled (boolean), join_threshold (number), timeframe (number)
- **Behavior**: Configure raid protection

**`/automod ignore`**

- **Subcommands**:
    - `channel add/remove <channel>` - Ignore channels
    - `role add/remove <role>` - Ignore roles
    - `list` - Show ignored channels/roles

## Phase 6: Custom Commands

### `/customcommand` - Custom Command Management

```typescript
// Location: packages/bot/src/functions/management/commands/customcommand.ts
// Service: CustomCommandService
// Permissions: MANAGE_GUILD
```

#### Subcommands:

**`/customcommand create`**

- **Options**: name (required), response (required), description (optional)
- **Behavior**: Creates new custom command

**`/customcommand edit`**

- **Options**: name (required), response (optional), description (optional)
- **Behavior**: Updates existing command

**`/customcommand delete`**

- **Options**: name (required)
- **Behavior**: Deletes custom command

**`/customcommand list`**

- **Behavior**: Shows all custom commands with pagination

**`/customcommand info`**

- **Options**: name (required)
- **Behavior**: Shows command details and usage stats

**`/customcommand permissions`**

- **Options**: name (required), roles (role array), users (user array)
- **Behavior**: Set who can use the command

## Phase 7: Embed Builder

### `/embed` - Embed Template Management

```typescript
// Location: packages/bot/src/functions/management/commands/embed.ts
// Service: EmbedBuilderService
// Permissions: MANAGE_GUILD
```

#### Subcommands:

**`/embed create`**

- **Modal**: Interactive embed builder
- **Fields**: title, description, color, footer, thumbnail, image, fields
- **Behavior**: Creates embed template

**`/embed edit`**

- **Options**: template_name (required)
- **Behavior**: Opens modal to edit template

**`/embed send`**

- **Options**: template_name (required), channel (optional)
- **Behavior**: Sends embed to channel

**`/embed list`**

- **Behavior**: Shows all saved templates

**`/embed delete`**

- **Options**: template_name (required)
- **Behavior**: Deletes template

## Phase 8: Auto-Messages

### `/automessage` - Auto-Message Configuration

```typescript
// Location: packages/bot/src/functions/management/commands/automessage.ts
// Service: AutoMessageService
// Permissions: MANAGE_GUILD
```

#### Subcommands:

**`/automessage welcome`**

- **Options**: enabled (boolean), channel (channel), message (string), embed_template (string)
- **Behavior**: Configure welcome messages
- **Placeholders**: {user}, {server}, {memberCount}

**`/automessage leave`**

- **Options**: enabled (boolean), channel (channel), message (string)
- **Behavior**: Configure leave messages

**`/automessage autoresponse`**

- **Options**: trigger (string), response (string), match_type (exact/contains/starts/ends)
- **Behavior**: Create auto-response triggers

**`/automessage scheduled`**

- **Options**: name (string), channel (channel), message (string), cron (string)
- **Behavior**: Schedule recurring messages

**`/automessage list`**

- **Options**: type (welcome/leave/autoresponse/scheduled)
- **Behavior**: List configured messages

## Phase 9: Server Logging

### `/logging` - Server Log Configuration

```typescript
// Location: packages/bot/src/functions/management/commands/logging.ts
// Service: ServerLogService
// Permissions: ADMINISTRATOR
```

#### Subcommands:

**`/logging setup`**

- **Options**: channel (required)
- **Behavior**: Set up logging channel

**`/logging events`**

- **Options**: enable/disable for each event type
- **Event Types**:
    - Message (edit, delete, bulk delete)
    - Member (join, leave, update, role change)
    - Voice (join, leave, move, mute, deafen)
    - Channel (create, delete, update)
    - Role (create, delete, update)
    - Server (update)

**`/logging ignore`**

- **Subcommands**:
    - `channel add/remove <channel>`
    - `user add/remove <user>`
    - `list`

**`/logging view`**

- **Options**: type (optional), limit (optional)
- **Behavior**: View recent logs

## Implementation Order

1. **Week 1**: Core moderation commands (warn, mute, kick, ban)
2. **Week 2**: Case management + moderation settings
3. **Week 3**: Auto-moderation system
4. **Week 4**: Custom commands + embed builder
5. **Week 5**: Auto-messages + server logging

## Event Handlers Required

### Moderation Events

- `guildMemberAdd` - Welcome messages, raid protection
- `guildMemberRemove` - Leave messages
- `messageCreate` - Auto-mod checks, auto-responses, custom commands
- `messageUpdate` - Auto-mod re-check
- `messageDelete` - Logging
- `messageDeleteBulk` - Logging

### Logging Events

- `guildMemberUpdate` - Role changes, nickname changes
- `voiceStateUpdate` - Voice activity logging
- `channelCreate/Delete/Update` - Channel logging
- `roleCreate/Delete/Update` - Role logging
- `guildUpdate` - Server settings logging

## Testing Strategy

1. **Unit Tests**: Service layer methods
2. **Integration Tests**: Command execution with mock Discord.js
3. **E2E Tests**: Full command flow in test server
4. **Permission Tests**: Verify permission checks
5. **Rate Limit Tests**: Ensure proper rate limiting

## Documentation Updates

- Update `README.md` with new features
- Create command documentation in `docs/COMMANDS.md`
- Update `CHANGELOG.md` with feature additions
- Add configuration examples to `docs/CONFIGURATION.md`
