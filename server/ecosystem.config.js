module.exports = {
    apps: [
        {
            name: 'inventory-server',
            script: './dist/server.js', // Production runs from the compiled 'dist' folder
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 4000
            },
            // Log paths for AWS
            error_file: 'logs/err.log',
            out_file: 'logs/out.log',
            merge_logs: true,
            time: true
        },
    ],
};
