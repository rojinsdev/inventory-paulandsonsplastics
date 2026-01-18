module.exports = {
    apps: [
        {
            name: 'inventory-server',
            script: './dist/server.js', // Production runs from the compiled 'dist' folder
            instances: 1, // 'max' for cluster mode, but 1 is safer for simple state
            autorestart: true,
            watch: false, // Don't watch for file changes in production
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 4000
            },
            // Error Logs
            error_file: './logs/err.log',
            out_file: './logs/out.log',
            time: true // Add timestamps to logs
        },
    ],
};
