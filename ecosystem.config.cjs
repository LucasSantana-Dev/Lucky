module.exports = {
    apps: [
        {
            name: "lukbot-bot",
            script: "./packages/bot/dist/index.js",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "300M",
            env: { NODE_ENV: "production" },
            env_production: { NODE_ENV: "production" },
        },
        {
            name: "lukbot-backend",
            script: "./packages/backend/dist/index.js",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "300M",
            env: { NODE_ENV: "production" },
            env_production: { NODE_ENV: "production" },
        },
    ],
}
