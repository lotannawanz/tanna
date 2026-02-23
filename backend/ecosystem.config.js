module.exports = {
    apps: [
        {
            name: 'tanna-api',
            script: 'dist/index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/api-error.log',
            out_file: './logs/api-out.log',
            merge_logs: true,
            time: true,
        },
        {
            name: 'tanna-worker',
            script: 'dist/worker.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '256M',
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/worker-error.log',
            out_file: './logs/worker-out.log',
            merge_logs: true,
            time: true,
        },
    ],
};
