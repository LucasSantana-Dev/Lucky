# FFmpeg Usage Guide

Comprehensive guide for using FFmpeg in Lucky for audio processing, format conversion, and audio effects.

## Table of Contents

- [Installation](#installation)
- [Basic Concepts](#basic-concepts)
- [Audio Processing](#audio-processing)
- [Integration with Discord Player](#integration-with-discord-player)
- [Common Use Cases](#common-use-cases)
- [Audio Filters & Effects](#audio-filters--effects)
- [Troubleshooting](#troubleshooting)
- [Performance Optimization](#performance-optimization)

---

## Installation

### Using ffmpeg-static (Recommended)

Lucky uses `ffmpeg-static` which provides pre-compiled FFmpeg binaries for all platforms.

```bash
npm install ffmpeg-static
```

**Advantages:**

- No system installation required
- Cross-platform compatibility
- Consistent version across environments
- Works in Docker containers

**Usage in Code:**

```typescript
import ffmpeg from 'ffmpeg-static'
import { spawn } from 'child_process'

// ffmpeg is the path to the binary
const process = spawn(ffmpeg, ['-version'])
```

---

### Manual Installation

For development or advanced use cases, you can install FFmpeg system-wide.

**macOS (Homebrew):**

```bash
brew install ffmpeg
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows (Chocolatey):**

```bash
choco install ffmpeg
```

**Verify Installation:**

```bash
ffmpeg -version
```

---

### Docker Setup

Lucky's Dockerfile already includes FFmpeg via `ffmpeg-static`. No additional configuration needed.

```dockerfile
# FFmpeg is included via npm dependencies
RUN npm ci --only=production
```

---

## Basic Concepts

### FFmpeg Command Structure

```bash
ffmpeg [global_options] [input_options] -i input_file [output_options] output_file
```

**Example:**

```bash
ffmpeg -i input.mp4 -vn -ar 48000 -ac 2 -b:a 192k output.mp3
```

**Breakdown:**

- `-i input.mp4` - Input file
- `-vn` - No video (audio only)
- `-ar 48000` - Audio sample rate (48kHz)
- `-ac 2` - Audio channels (stereo)
- `-b:a 192k` - Audio bitrate (192 kbps)
- `output.mp3` - Output file

---

### Common Options

| Option | Description       | Example              |
| ------ | ----------------- | -------------------- |
| `-i`   | Input file        | `-i input.mp4`       |
| `-f`   | Force format      | `-f mp3`             |
| `-ar`  | Audio sample rate | `-ar 48000`          |
| `-ac`  | Audio channels    | `-ac 2`              |
| `-b:a` | Audio bitrate     | `-b:a 192k`          |
| `-vn`  | Disable video     | `-vn`                |
| `-an`  | Disable audio     | `-an`                |
| `-t`   | Duration          | `-t 30` (30 seconds) |
| `-ss`  | Start time        | `-ss 00:01:00`       |
| `-to`  | End time          | `-to 00:02:00`       |

---

## Audio Processing

### Format Conversion

**MP4 to MP3:**

```typescript
import ffmpeg from 'ffmpeg-static'
import { spawn } from 'child_process'

function convertToMP3(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn(ffmpeg, [
            '-i',
            inputPath,
            '-vn', // No video
            '-ar',
            '48000', // 48kHz sample rate
            '-ac',
            '2', // Stereo
            '-b:a',
            '192k', // 192 kbps bitrate
            '-f',
            'mp3', // MP3 format
            outputPath,
        ])

        process.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`FFmpeg exited with code ${code}`))
        })

        process.stderr.on('data', (data) => {
            console.log(`FFmpeg: ${data}`)
        })
    })
}
```

**WebM to MP3:**

```typescript
const args = [
    '-i',
    'input.webm',
    '-vn',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-b:a',
    '192k',
    'output.mp3',
]
```

---

### Audio Extraction

**Extract Audio from Video:**

```typescript
function extractAudio(videoPath: string, audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn(ffmpeg, [
            '-i',
            videoPath,
            '-vn', // No video
            '-acodec',
            'copy', // Copy audio codec (no re-encoding)
            audioPath,
        ])

        process.on('close', (code) => {
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))
        })
    })
}
```

---

### Bitrate Adjustment

**Change Audio Bitrate:**

```typescript
const args = [
    '-i',
    'input.mp3',
    '-b:a',
    '128k', // Lower bitrate for smaller file
    'output.mp3',
]
```

**Variable Bitrate (VBR):**

```typescript
const args = [
    '-i',
    'input.mp3',
    '-q:a',
    '2', // Quality level (0-9, lower is better)
    'output.mp3',
]
```

---

### Volume Normalization

**Normalize Audio Volume:**

```typescript
function normalizeVolume(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn(ffmpeg, [
            '-i',
            inputPath,
            '-af',
            'loudnorm', // Loudness normalization filter
            '-ar',
            '48000',
            '-ac',
            '2',
            outputPath,
        ])

        process.on('close', (code) => {
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))
        })
    })
}
```

**Adjust Volume by Percentage:**

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'volume=1.5', // 150% volume
    'output.mp3',
]

// Or in decibels
const argsDB = [
    '-i',
    'input.mp3',
    '-af',
    'volume=10dB', // +10dB
    'output.mp3',
]
```

---

## Integration with Discord Player

### Discord Player Configuration

Discord Player automatically uses FFmpeg for audio processing. You can customize FFmpeg options:

```typescript
import { Player } from 'discord-player'

const player = new Player(client, {
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
    },
})
```

---

### Custom FFmpeg Arguments

**Apply Audio Filters:**

```typescript
const queue = player.nodes.create(guild, {
    metadata: {
        channel: interaction.channel,
    },
    // Custom FFmpeg arguments
    ffmpegArgs: [
        '-af',
        'bass=g=10', // Bass boost
        '-ar',
        '48000',
        '-ac',
        '2',
    ],
})
```

---

### Stream Processing

**Process Audio Stream:**

```typescript
import { createAudioResource } from '@discordjs/voice'
import { spawn } from 'child_process'

function createProcessedStream(url: string) {
    const ffmpegProcess = spawn(ffmpeg, [
        '-i',
        url,
        '-analyzeduration',
        '0',
        '-loglevel',
        '0',
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        'pipe:1',
    ])

    return createAudioResource(ffmpegProcess.stdout)
}
```

---

## Common Use Cases

### 1. Download and Convert YouTube Audio

```typescript
import ffmpeg from 'ffmpeg-static'
import { spawn } from 'child_process'
import ytdl from 'ytdl-core'

async function downloadYouTubeAudio(
    url: string,
    outputPath: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const video = ytdl(url, { quality: 'highestaudio' })

        const ffmpegProcess = spawn(ffmpeg, [
            '-i',
            'pipe:0', // Read from stdin
            '-vn',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-b:a',
            '192k',
            '-f',
            'mp3',
            outputPath,
        ])

        video.pipe(ffmpegProcess.stdin)

        ffmpegProcess.on('close', (code) => {
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))
        })

        ffmpegProcess.stderr.on('data', (data) => {
            console.log(`FFmpeg: ${data}`)
        })
    })
}
```

---

### 2. Trim Audio

```typescript
function trimAudio(
    inputPath: string,
    outputPath: string,
    startTime: string,
    duration: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn(ffmpeg, [
            '-ss',
            startTime, // Start time (e.g., '00:01:30')
            '-i',
            inputPath,
            '-t',
            duration, // Duration (e.g., '00:00:30')
            '-acodec',
            'copy', // Copy codec (fast)
            outputPath,
        ])

        process.on('close', (code) => {
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))
        })
    })
}

// Usage
await trimAudio('input.mp3', 'output.mp3', '00:01:00', '00:00:30')
```

---

### 3. Merge Audio Files

```typescript
function mergeAudio(files: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Create concat file
        const concatList = files.map((f) => `file '${f}'`).join('\n')
        fs.writeFileSync('concat.txt', concatList)

        const process = spawn(ffmpeg, [
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            'concat.txt',
            '-c',
            'copy',
            outputPath,
        ])

        process.on('close', (code) => {
            fs.unlinkSync('concat.txt')
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))
        })
    })
}
```

---

### 4. Get Audio Metadata

```typescript
function getAudioMetadata(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const process = spawn(ffmpeg, [
            '-i',
            filePath,
            '-f',
            'ffmetadata',
            'pipe:1',
        ])

        let output = ''
        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.on('close', (code) => {
            if (code === 0) {
                resolve(parseMetadata(output))
            } else {
                reject(new Error(`Exit code ${code}`))
            }
        })
    })
}
```

---

## Audio Filters & Effects

### Bass Boost

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'bass=g=10', // Gain: 0-20 (10 is moderate)
    'output.mp3',
]
```

---

### Nightcore Effect

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'asetrate=48000*1.25,aresample=48000', // Speed up by 25%
    'output.mp3',
]
```

---

### Vaporwave Effect

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'asetrate=48000*0.8,aresample=48000', // Slow down by 20%
    'output.mp3',
]
```

---

### Echo Effect

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'aecho=0.8:0.9:1000:0.3', // Echo with delay
    'output.mp3',
]
```

---

### Equalizer

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'equalizer=f=1000:width_type=h:width=200:g=10', // Boost 1kHz
    'output.mp3',
]
```

---

### Multiple Filters

```typescript
const args = [
    '-i',
    'input.mp3',
    '-af',
    'bass=g=5,volume=1.5,loudnorm', // Chain multiple filters
    'output.mp3',
]
```

---

## Troubleshooting

### Common Errors

**1. "ffmpeg: command not found"**

**Solution:**

- Ensure `ffmpeg-static` is installed
- Check that the import is correct
- Verify the binary path

```typescript
import ffmpeg from 'ffmpeg-static'
console.log('FFmpeg path:', ffmpeg)
```

---

**2. "Invalid argument" or "Option not found"**

**Solution:**

- Check FFmpeg version compatibility
- Verify option syntax
- Use `ffmpeg -h` to see available options

---

**3. "Conversion failed" or "Exit code 1"**

**Solution:**

- Check input file exists and is readable
- Verify output path is writable
- Check FFmpeg stderr for detailed error

```typescript
process.stderr.on('data', (data) => {
    console.error('FFmpeg error:', data.toString())
})
```

---

**4. "Codec not supported"**

**Solution:**

- Use a different codec
- Check FFmpeg build includes the codec
- Use `-codecs` to list available codecs

```bash
ffmpeg -codecs
```

---

**5. High CPU Usage**

**Solution:**

- Use hardware acceleration if available
- Reduce quality/bitrate
- Use codec copy when possible (`-acodec copy`)

---

### Debugging Tips

**Enable Verbose Logging:**

```typescript
const args = [
    '-loglevel',
    'debug', // or 'verbose', 'info'
    '-i',
    'input.mp3',
    'output.mp3',
]
```

**Check FFmpeg Version:**

```typescript
const process = spawn(ffmpeg, ['-version'])
process.stdout.on('data', (data) => {
    console.log(data.toString())
})
```

**Test with Simple Command:**

```bash
ffmpeg -i input.mp3 -f null -
```

---

## Performance Optimization

### 1. Use Codec Copy When Possible

```typescript
// Fast (no re-encoding)
const args = ['-i', 'input.mp4', '-vn', '-acodec', 'copy', 'output.m4a']

// Slow (re-encoding)
const args = ['-i', 'input.mp4', '-vn', '-b:a', '192k', 'output.mp3']
```

---

### 2. Hardware Acceleration

**macOS (VideoToolbox):**

```typescript
const args = ['-hwaccel', 'videotoolbox', '-i', 'input.mp4', 'output.mp3']
```

**NVIDIA GPU:**

```typescript
const args = ['-hwaccel', 'cuda', '-i', 'input.mp4', 'output.mp3']
```

---

### 3. Optimize for Streaming

```typescript
const args = [
    '-i',
    url,
    '-analyzeduration',
    '0', // Don't analyze input
    '-loglevel',
    '0', // Minimal logging
    '-f',
    's16le', // Raw PCM format
    '-ar',
    '48000',
    '-ac',
    '2',
    'pipe:1',
]
```

---

### 4. Batch Processing

```typescript
async function processBatch(files: string[]) {
    // Process in parallel (limit concurrency)
    const limit = 3
    const chunks = []

    for (let i = 0; i < files.length; i += limit) {
        chunks.push(files.slice(i, i + limit))
    }

    for (const chunk of chunks) {
        await Promise.all(chunk.map((file) => processFile(file)))
    }
}
```

---

### 5. Memory Management

```typescript
const process = spawn(ffmpeg, args, {
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
})

// Clean up on error
process.on('error', () => {
    process.kill()
})
```

---

## Best Practices

1. **Always handle errors:**

    ```typescript
    process.on('error', (err) => {
        console.error('FFmpeg error:', err)
    })
    ```

2. **Use appropriate quality settings:**
    - Voice chat: 64-96 kbps
    - Music: 128-192 kbps
    - High quality: 256-320 kbps

3. **Clean up temporary files:**

    ```typescript
    try {
        await processAudio(input, output)
    } finally {
        fs.unlinkSync(tempFile)
    }
    ```

4. **Validate input:**

    ```typescript
    if (!fs.existsSync(inputPath)) {
        throw new Error('Input file not found')
    }
    ```

5. **Use streams for large files:**
    ```typescript
    const readStream = fs.createReadStream(inputPath)
    readStream.pipe(ffmpegProcess.stdin)
    ```

---

## Additional Resources

- **FFmpeg Official Documentation:** <https://ffmpeg.org/documentation.html>
- **FFmpeg Wiki:** <https://trac.ffmpeg.org/wiki>
- **Audio Filters:** <https://ffmpeg.org/ffmpeg-filters.html#Audio-Filters>
- **Codec Guide:** <https://trac.ffmpeg.org/wiki/Encode/HighQualityAudio>
- **ffmpeg-static GitHub:** <https://github.com/eugeneware/ffmpeg-static>

---

## See Also

- [Library References](./LIBRARY_REFERENCES.md) - All dependency documentation
- [Discord Player Guide](./DISCORD_PLAYER_GUIDE.md) - Discord Player integration
- [Code Examples](./CODE_EXAMPLES.md) - Common code patterns

---

**Last Updated:** February 2026
