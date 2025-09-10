declare module "ytdl-core" {
    import { Readable, Writable } from "stream"

    interface VideoDetails {
        lengthSeconds: string
        [key: string]: any
    }

    interface VideoInfo {
        videoDetails: VideoDetails
        [key: string]: any
    }

    interface YtdlOptions {
        quality?: string
        filter?: string
        [key: string]: any
    }

    interface YtdlStream extends Readable {
        pipe<T extends Writable>(destination: T, options?: { end?: boolean }): T
    }

    function ytdl(url: string, options?: YtdlOptions): YtdlStream

    namespace ytdl {
        function getInfo(url: string): Promise<VideoInfo>
        const videoInfo: VideoInfo
    }

    export = ytdl
}
