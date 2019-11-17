module.exports = {
	apps: [
		{
			name: 'OFO Engine',
			script: 'lib/bootstrap',
			instances: 'max',
			autorestart: true,
			watch: false,
			max_memory_restart: '1G',
			env: {
				NODE_ENV: 'development'
			},
			env_production: {
				NODE_ENV: 'production'
			}
		}
	]
};
