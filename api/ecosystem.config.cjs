module.exports = {
  apps: [
    {
      name: 'tasks-1-api',
      script: 'src/index.js',
      cwd: __dirname,
      env_production: {
        NODE_ENV: 'production',
        ENV_FILE: '.env',
      },
      watch: false,
      max_memory_restart: '256M',
    },
  ],
};
