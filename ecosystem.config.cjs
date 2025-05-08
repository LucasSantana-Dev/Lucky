module.exports = {
  apps: [
    {
      name: 'lukbot',
      script: './dist/index.js',
      instances: 1, // Change to 'max' for cluster mode if needed
      autorestart: true,
      watch: false,
      max_memory_restart: '300M', // Restart if using more than 300MB RAM
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}; 